import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { BuildRequest, BuilderNode, ScheduleResult } from '../types';
import { config } from '../config';

export class SchedulerService {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private builderNodes: Map<string, BuilderNode> = new Map();
  private schedulingQueue: BuildRequest[] = [];
  private isProcessing = false;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async start() {
    await this.discoverBuilders();
    setInterval(() => this.processQueue(), 1000);
    setInterval(() => this.healthCheck(), 10000);
    setInterval(() => this.updateMetrics(), 30000);
    logger.info('Scheduler service started');
  }

  async scheduleBuild(request: BuildRequest): Promise<ScheduleResult> {
    const buildId = uuidv4();

    await this.prisma.build.create({
      data: {
        id: buildId,
        projectId: request.projectId,
        userId: request.userId,
        status: 'queued',
        platforms: request.platforms,
        imageTags: request.tags || [],
        builderArch: this.selectArchitecture(request.platforms),
        trace: request.trace || {}
      }
    });

    this.schedulingQueue.push({
      ...request,
      buildId,
      priority: this.calculatePriority(request)
    });

    await this.redis.publish('build:queued', JSON.stringify({
      buildId,
      projectId: request.projectId
    }));

    const position = this.schedulingQueue.length;
    const estimatedWait = position * 5;

    return {
      buildId,
      status: 'queued',
      position,
      estimatedWaitSeconds: estimatedWait,
      builder: null
    };
  }

  private async processQueue() {
    if (this.isProcessing || this.schedulingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      this.schedulingQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      for (let i = 0; i < this.schedulingQueue.length; i++) {
        const request = this.schedulingQueue[i];
        const builder = await this.findAvailableBuilder(request);

        if (builder) {
          this.schedulingQueue.splice(i, 1);
          i--;

          await this.assignBuildToBuilder(request, builder);

          logger.info({
            buildId: request.buildId,
            builder: builder.id
          }, 'Build scheduled to builder');
        }
      }
    } catch (error) {
      logger.error(error, 'Error processing scheduling queue');
    } finally {
      this.isProcessing = false;
    }
  }

  private async findAvailableBuilder(request: BuildRequest): Promise<BuilderNode | null> {
    const requiredArch = this.selectArchitecture(request.platforms);

    for (const [id, node] of this.builderNodes) {
      if (node.architecture === requiredArch &&
          node.status === 'ready' &&
          node.currentBuilds < node.maxConcurrency) {

        const cache = await this.getProjectCache(request.projectId, requiredArch);
        if (cache && node.cacheVolumes.includes(cache.id)) {
          return node;
        }
      }
    }

    const canScale = await this.checkAutoScaling(request.projectId);
    if (canScale) {
      return await this.scaleUpBuilder(request.projectId, requiredArch);
    }

    return null;
  }

  private async assignBuildToBuilder(request: BuildRequest, builder: BuilderNode) {
    builder.currentBuilds++;
    builder.lastAssigned = new Date();

    await this.prisma.build.update({
      where: { id: request.buildId },
      data: {
        status: 'building',
        startedAt: new Date()
      }
    });

    const buildConfig = {
      buildId: request.buildId,
      projectId: request.projectId,
      dockerfile: request.dockerfile,
      context: request.context,
      platforms: request.platforms,
      tags: request.tags,
      buildArgs: request.buildArgs,
      secrets: request.secrets,
      cacheFrom: request.cacheFrom,
      cacheTo: request.cacheTo,
      push: request.push
    };

    await this.redis.publish(`builder:${builder.id}:assign`, JSON.stringify(buildConfig));
  }

  private async discoverBuilders() {
    const builderKeys = await this.redis.keys('builder:*:info');

    for (const key of builderKeys) {
      const info = await this.redis.get(key);
      if (info) {
        const node = JSON.parse(info) as BuilderNode;
        this.builderNodes.set(node.id, node);
      }
    }

    logger.info(`Discovered ${this.builderNodes.size} builder nodes`);
  }

  private async healthCheck() {
    for (const [id, node] of this.builderNodes) {
      const lastSeen = Date.now() - node.lastHeartbeat.getTime();

      if (lastSeen > 30000) {
        node.status = 'unhealthy';
        logger.warn({ builderId: id }, 'Builder node unhealthy');

        const activeBuilds = await this.prisma.build.findMany({
          where: {
            status: 'building',
            builderArch: node.architecture
          }
        });

        for (const build of activeBuilds) {
          this.schedulingQueue.push({
            buildId: build.id,
            projectId: build.projectId,
            userId: build.userId || undefined,
            platforms: build.platforms,
            priority: 10
          });
        }
      }
    }
  }

  private async updateMetrics() {
    const metrics = {
      queueSize: this.schedulingQueue.length,
      activeBuilders: Array.from(this.builderNodes.values()).filter(n => n.status === 'ready').length,
      totalCapacity: Array.from(this.builderNodes.values()).reduce((sum, n) => sum + n.maxConcurrency, 0),
      currentLoad: Array.from(this.builderNodes.values()).reduce((sum, n) => sum + n.currentBuilds, 0)
    };

    await this.redis.set('scheduler:metrics', JSON.stringify(metrics), 'EX', 60);
    logger.debug(metrics, 'Scheduler metrics updated');
  }

  private selectArchitecture(platforms: string[]): string {
    for (const platform of platforms) {
      if (platform.includes('arm64') || platform.includes('aarch64')) {
        return 'arm64';
      }
    }
    return 'x86_64';
  }

  private calculatePriority(request: BuildRequest): number {
    let priority = 5;

    if (request.userId) {
      priority += 2;
    }

    const org = this.prisma.organization.findFirst({
      where: {
        projects: {
          some: {
            id: request.projectId
          }
        }
      }
    });

    return priority;
  }

  private async getProjectCache(projectId: string, architecture: string) {
    return await this.prisma.cache.findUnique({
      where: {
        projectId_architecture: {
          projectId,
          architecture
        }
      }
    });
  }

  private async checkAutoScaling(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId }
    });

    return project?.autoscalingEnabled || false;
  }

  private async scaleUpBuilder(projectId: string, architecture: string): Promise<BuilderNode | null> {
    logger.info({ projectId, architecture }, 'Scaling up builder');

    const builderId = `builder-${uuidv4()}`;
    const cache = await this.getProjectCache(projectId, architecture);

    const newNode: BuilderNode = {
      id: builderId,
      architecture,
      region: config.builders.regions[0],
      status: 'provisioning',
      maxConcurrency: 5,
      currentBuilds: 0,
      cacheVolumes: cache ? [cache.id] : [],
      lastHeartbeat: new Date(),
      lastAssigned: new Date(),
      resources: config.builders.defaultSize
    };

    this.builderNodes.set(builderId, newNode);

    await this.redis.publish('builder:scale', JSON.stringify({
      action: 'up',
      builderId,
      projectId,
      architecture
    }));

    setTimeout(() => {
      newNode.status = 'ready';
    }, 30000);

    return null;
  }
}