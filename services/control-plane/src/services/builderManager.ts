import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { BuilderNode, BuildResult } from '../types';
import { config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BuilderManager {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private builders: Map<string, BuilderNode> = new Map();
  private buildProcesses: Map<string, any> = new Map();

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async initialize() {
    await this.startEventListeners();
    await this.registerLocalBuilder();
    setInterval(() => this.reportHealth(), 10000);
    logger.info('Builder manager initialized');
  }

  private async startEventListeners() {
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe('builder:scale', 'builder:*:assign', 'builder:*:complete');

    subscriber.on('message', async (channel, message) => {
      try {
        if (channel === 'builder:scale') {
          await this.handleScaleEvent(JSON.parse(message));
        } else if (channel.includes(':assign')) {
          const builderId = channel.split(':')[1];
          await this.handleBuildAssignment(builderId, JSON.parse(message));
        } else if (channel.includes(':complete')) {
          const builderId = channel.split(':')[1];
          await this.handleBuildComplete(builderId);
        }
      } catch (error) {
        logger.error({ error, channel, message }, 'Error handling builder event');
      }
    });
  }

  private async registerLocalBuilder() {
    const builderId = `builder-local-${uuidv4()}`;

    const builder: BuilderNode = {
      id: builderId,
      architecture: process.arch === 'arm64' ? 'arm64' : 'x86_64',
      region: 'local',
      status: 'ready',
      maxConcurrency: 2,
      currentBuilds: 0,
      cacheVolumes: [],
      lastHeartbeat: new Date(),
      lastAssigned: new Date(),
      resources: {
        cpus: 4,
        memoryGB: 8
      }
    };

    this.builders.set(builderId, builder);

    await this.redis.set(`builder:${builderId}:info`, JSON.stringify(builder), 'EX', 60);
    logger.info({ builderId }, 'Local builder registered');
  }

  private async handleBuildAssignment(builderId: string, buildConfig: any) {
    const builder = this.builders.get(builderId);
    if (!builder || builder.status !== 'ready') {
      logger.warn({ builderId }, 'Builder not available for assignment');
      return;
    }

    logger.info({ buildId: buildConfig.buildId, builderId }, 'Starting build');

    try {
      await this.executeBuild(builderId, buildConfig);
    } catch (error) {
      logger.error({ error, buildId: buildConfig.buildId }, 'Build execution failed');
      await this.reportBuildFailure(buildConfig.buildId, error);
    }
  }

  private async executeBuild(builderId: string, buildConfig: any) {
    const { buildId, projectId } = buildConfig;

    await this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: 'building',
        startedAt: new Date()
      }
    });

    const builder = this.builders.get(builderId);
    if (!builder) throw new Error('Builder not found');

    builder.currentBuilds++;

    const startTime = Date.now();
    let cacheHits = 0;
    let totalSteps = 0;

    const buildCommand = this.constructBuildCommand(buildConfig);

    logger.info({ buildId, command: buildCommand }, 'Executing build command');

    const buildProcess = execAsync(buildCommand, {
      env: {
        ...process.env,
        BUILDKIT_HOST: config.buildkit.defaultHost
      }
    });

    this.buildProcesses.set(buildId, buildProcess);

    try {
      const { stdout } = await buildProcess;

      const duration = Math.round((Date.now() - startTime) / 1000);

      const cacheMetrics = this.parseCacheMetrics(stdout);
      cacheHits = cacheMetrics.hits;
      totalSteps = cacheMetrics.total;

      const result: BuildResult = {
        buildId,
        status: 'success',
        duration,
        cacheHitRate: totalSteps > 0 ? cacheHits / totalSteps : 0,
        cacheSavedSeconds: Math.round(cacheHits * 2),
        logs: stdout,
        digest: this.extractImageDigest(stdout),
        size: this.extractImageSize(stdout)
      };

      await this.updateBuildSuccess(buildId, result);
      await this.updateCacheMetrics(projectId, builder.architecture, cacheHits, totalSteps);

      logger.info({ buildId, duration, cacheHitRate: result.cacheHitRate }, 'Build completed successfully');

    } catch (error: any) {
      const duration = Math.round((Date.now() - startTime) / 1000);

      await this.prisma.build.update({
        where: { id: buildId },
        data: {
          status: 'error',
          duration,
          error: error.message,
          endedAt: new Date()
        }
      });

      throw error;
    } finally {
      builder.currentBuilds--;
      this.buildProcesses.delete(buildId);
    }
  }

  private constructBuildCommand(config: any): string {
    let cmd = 'buildctl build';

    cmd += ` --frontend dockerfile.v0`;
    cmd += ` --local context=${config.context || '.'}`;
    cmd += ` --local dockerfile=${config.dockerfile || '.'}`;

    if (config.platforms && config.platforms.length > 0) {
      cmd += ` --opt platform=${config.platforms.join(',')}`;
    }

    if (config.tags && config.tags.length > 0) {
      for (const tag of config.tags) {
        cmd += ` --output type=image,name=${tag},push=${config.push ? 'true' : 'false'}`;
      }
    }

    if (config.buildArgs) {
      for (const [key, value] of Object.entries(config.buildArgs)) {
        cmd += ` --opt build-arg:${key}=${value}`;
      }
    }

    if (config.cacheFrom) {
      cmd += ` --import-cache type=registry,ref=${config.cacheFrom}`;
    }

    if (config.cacheTo) {
      cmd += ` --export-cache type=registry,ref=${config.cacheTo}`;
    }

    return cmd;
  }

  private parseCacheMetrics(output: string): { hits: number; total: number } {
    const lines = output.split('\n');
    let hits = 0;
    let total = 0;

    for (const line of lines) {
      if (line.includes('CACHED')) {
        hits++;
      }
      if (line.includes('=>')) {
        total++;
      }
    }

    return { hits, total };
  }

  private extractImageDigest(output: string): string | null {
    const match = output.match(/sha256:[a-f0-9]{64}/);
    return match ? match[0] : null;
  }

  private extractImageSize(output: string): number {
    const match = output.match(/size:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private async updateBuildSuccess(buildId: string, result: BuildResult) {
    await this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: 'success',
        duration: result.duration,
        cacheSavedSeconds: result.cacheSavedSeconds,
        cacheHitRate: result.cacheHitRate,
        endedAt: new Date(),
        billableMinutes: Math.ceil(result.duration / 60)
      }
    });
  }

  private async updateCacheMetrics(projectId: string, architecture: string, hits: number, total: number) {
    const cache = await this.prisma.cache.findUnique({
      where: {
        projectId_architecture: {
          projectId,
          architecture
        }
      }
    });

    if (cache) {
      const newHitRate = cache.hitRate * 0.9 + (hits / Math.max(total, 1)) * 0.1;

      await this.prisma.cache.update({
        where: { id: cache.id },
        data: {
          hitRate: newHitRate,
          lastUsedAt: new Date()
        }
      });
    }
  }

  private async reportBuildFailure(buildId: string, error: any) {
    await this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: 'error',
        error: error.message || 'Build failed',
        endedAt: new Date()
      }
    });
  }

  private async handleBuildComplete(builderId: string) {
    const builder = this.builders.get(builderId);
    if (builder) {
      builder.currentBuilds = Math.max(0, builder.currentBuilds - 1);
    }
  }

  private async handleScaleEvent(event: any) {
    if (event.action === 'up') {
      await this.scaleUpBuilder(event);
    } else if (event.action === 'down') {
      await this.scaleDownBuilder(event.builderId);
    }
  }

  private async scaleUpBuilder(event: any) {
    logger.info(event, 'Scaling up builder');
  }

  private async scaleDownBuilder(builderId: string) {
    this.builders.delete(builderId);
    await this.redis.del(`builder:${builderId}:info`);
    logger.info({ builderId }, 'Builder scaled down');
  }

  private async reportHealth() {
    for (const [id, builder] of this.builders) {
      builder.lastHeartbeat = new Date();
      await this.redis.set(`builder:${id}:info`, JSON.stringify(builder), 'EX', 60);
    }
  }

  async stopBuild(buildId: string): Promise<void> {
    const process = this.buildProcesses.get(buildId);
    if (process) {
      process.kill();
      this.buildProcesses.delete(buildId);

      await this.prisma.build.update({
        where: { id: buildId },
        data: {
          status: 'cancelled',
          endedAt: new Date()
        }
      });
    }
  }

  async getBuilderStatus(builderId: string): Promise<BuilderNode | null> {
    return this.builders.get(builderId) || null;
  }

  async listBuilders(): Promise<BuilderNode[]> {
    return Array.from(this.builders.values());
  }
}