import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as Minio from 'minio';
import { logger } from '../utils/logger';
import { CacheEntry, CacheStats } from '../types';
import { config } from '../config';

export class CacheManager {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly minio: Minio.Client;
  private cacheStats: Map<string, CacheStats> = new Map();

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.minio = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey
    });
  }

  async initialize() {
    await this.ensureBuckets();
    await this.loadCacheStats();
    setInterval(() => this.evictStaleEntries(), 3600000);
    setInterval(() => this.updateStats(), 60000);
    logger.info('Cache manager initialized');
  }

  private async ensureBuckets() {
    const buckets = ['cache-layers', 'cache-metadata', 'cache-manifests'];

    for (const bucket of buckets) {
      const exists = await this.minio.bucketExists(bucket);
      if (!exists) {
        await this.minio.makeBucket(bucket, config.builders.regions[0]);
        logger.info({ bucket }, 'Created cache bucket');
      }
    }
  }

  async getCacheForProject(projectId: string, architecture: string) {
    let cache = await this.prisma.cache.findUnique({
      where: {
        projectId_architecture: {
          projectId,
          architecture
        }
      }
    });

    if (!cache) {
      cache = await this.prisma.cache.create({
        data: {
          projectId,
          architecture,
          sizeGB: 0,
          hitRate: 0,
          evictionPolicy: 'lru'
        }
      });
    }

    return cache;
  }

  async storeCacheEntry(
    projectId: string,
    architecture: string,
    key: string,
    data: Buffer,
    metadata: any
  ): Promise<CacheEntry> {
    const cache = await this.getCacheForProject(projectId, architecture);
    const digest = this.calculateDigest(data);
    const sizeBytes = data.length;

    const existing = await this.prisma.cacheEntry.findFirst({
      where: {
        cacheId: cache.id,
        digest
      }
    });

    if (existing) {
      await this.prisma.cacheEntry.update({
        where: { id: existing.id },
        data: { lastUsedAt: new Date() }
      });
      return existing as any;
    }

    const objectName = `${projectId}/${architecture}/${digest}`;
    await this.minio.putObject('cache-layers', objectName, data, sizeBytes, {
      'Content-Type': 'application/octet-stream',
      ...metadata
    });

    const entry = await this.prisma.cacheEntry.create({
      data: {
        cacheId: cache.id,
        key,
        digest,
        sizeBytes,
        command: metadata.command || null
      }
    });

    await this.updateCacheSize(cache.id);

    logger.debug({
      projectId,
      architecture,
      key,
      sizeBytes,
      digest
    }, 'Cache entry stored');

    return entry as any;
  }

  async retrieveCacheEntry(
    projectId: string,
    architecture: string,
    key: string
  ): Promise<Buffer | null> {
    const cache = await this.getCacheForProject(projectId, architecture);

    const entry = await this.prisma.cacheEntry.findFirst({
      where: {
        cacheId: cache.id,
        key
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!entry) {
      this.incrementMiss(cache.id);
      return null;
    }

    const objectName = `${projectId}/${architecture}/${entry.digest}`;

    try {
      const stream = await this.minio.getObject('cache-layers', objectName);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          this.incrementHit(cache.id);
          this.prisma.cacheEntry.update({
            where: { id: entry.id },
            data: { lastUsedAt: new Date() }
          }).catch(logger.error);

          resolve(Buffer.concat(chunks));
        });
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error({ error, key }, 'Failed to retrieve cache entry');
      this.incrementMiss(cache.id);
      return null;
    }
  }

  async getCacheStats(projectId: string): Promise<CacheStats> {
    const caches = await this.prisma.cache.findMany({
      where: { projectId },
      include: {
        entries: {
          select: {
            sizeBytes: true,
            lastUsedAt: true
          }
        }
      }
    });

    const stats: CacheStats = {
      totalSizeGB: 0,
      hitRate: 0,
      entryCount: 0,
      architectures: {}
    };

    for (const cache of caches) {
      const sizeGB = Number(cache.entries.reduce((sum: bigint, e: any) => sum + e.sizeBytes, 0n)) / (1024 ** 3);

      stats.architectures[cache.architecture] = {
        sizeGB,
        hitRate: cache.hitRate,
        entryCount: cache.entries.length,
        lastUsed: cache.lastUsedAt
      };

      stats.totalSizeGB += sizeGB;
      stats.entryCount += cache.entries.length;
    }

    stats.hitRate = caches.length > 0
      ? caches.reduce((sum: number, c: any) => sum + c.hitRate, 0) / caches.length
      : 0;

    return stats;
  }

  async pruneCache(projectId: string, targetSizeGB?: number): Promise<number> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      throw new Error('Project not found');
    }

    let totalPruned = 0;

    for (const arch of ['x86_64', 'arm64']) {
      const cache = await this.getCacheForProject(projectId, arch);
      const target = targetSizeGB || (project.cacheStorageTargetGB as any)[arch] || config.cache.defaultSizeGB;

      const entries = await this.prisma.cacheEntry.findMany({
        where: { cacheId: cache.id },
        orderBy: { lastUsedAt: 'asc' }
      });

      let currentSize = Number(entries.reduce((sum: bigint, e: any) => sum + e.sizeBytes, 0n)) / (1024 ** 3);

      for (const entry of entries) {
        if (currentSize <= target) break;

        const objectName = `${projectId}/${arch}/${entry.digest}`;

        try {
          await this.minio.removeObject('cache-layers', objectName);
          await this.prisma.cacheEntry.delete({ where: { id: entry.id } });

          const sizeGB = Number(entry.sizeBytes) / (1024 ** 3);
          currentSize -= sizeGB;
          totalPruned += sizeGB;

          logger.info({
            projectId,
            architecture: arch,
            digest: entry.digest,
            sizeGB
          }, 'Cache entry pruned');
        } catch (error) {
          logger.error({ error, entryId: entry.id }, 'Failed to prune cache entry');
        }
      }

      await this.updateCacheSize(cache.id);
    }

    return totalPruned;
  }

  async resetCache(projectId: string): Promise<void> {
    logger.info({ projectId }, 'Resetting project cache');

    for (const arch of ['x86_64', 'arm64']) {
      const cache = await this.getCacheForProject(projectId, arch);

      const entries = await this.prisma.cacheEntry.findMany({
        where: { cacheId: cache.id }
      });

      for (const entry of entries) {
        const objectName = `${projectId}/${arch}/${entry.digest}`;

        try {
          await this.minio.removeObject('cache-layers', objectName);
        } catch (error) {
          logger.error({ error, entryId: entry.id }, 'Failed to remove cache object');
        }
      }

      await this.prisma.cacheEntry.deleteMany({
        where: { cacheId: cache.id }
      });

      await this.prisma.cache.update({
        where: { id: cache.id },
        data: {
          sizeGB: 0,
          hitRate: 0,
          lastUsedAt: new Date()
        }
      });
    }
  }

  private async loadCacheStats() {
    const caches = await this.prisma.cache.findMany();

    for (const cache of caches) {
      this.cacheStats.set(cache.id, {
        hits: 0,
        misses: 0,
        totalSizeGB: cache.sizeGB,
        hitRate: cache.hitRate,
        entryCount: 0,
        architectures: {}
      });
    }
  }

  private async evictStaleEntries() {
    const projects = await this.prisma.project.findMany();

    for (const project of projects) {
      const retentionDays = project.cacheRetentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const staleEntries = await this.prisma.cacheEntry.findMany({
        where: {
          cache: {
            projectId: project.id
          },
          lastUsedAt: {
            lt: cutoff
          }
        }
      });

      for (const entry of staleEntries) {
        const cache = await this.prisma.cache.findUnique({
          where: { id: entry.cacheId }
        });

        if (cache) {
          const objectName = `${project.id}/${cache.architecture}/${entry.digest}`;

          try {
            await this.minio.removeObject('cache-layers', objectName);
            await this.prisma.cacheEntry.delete({ where: { id: entry.id } });

            logger.info({
              projectId: project.id,
              entryId: entry.id,
              age: Math.round((Date.now() - entry.lastUsedAt.getTime()) / (24 * 60 * 60 * 1000))
            }, 'Evicted stale cache entry');
          } catch (error) {
            logger.error({ error, entryId: entry.id }, 'Failed to evict cache entry');
          }
        }
      }
    }
  }

  private async updateStats() {
    for (const [cacheId, stats] of this.cacheStats) {
      if (stats.hits !== undefined && stats.misses !== undefined && stats.hits + stats.misses > 0) {
        const hitRate = stats.hits / (stats.hits + stats.misses);

        await this.prisma.cache.update({
          where: { id: cacheId },
          data: { hitRate }
        });

        await this.redis.set(
          `cache:stats:${cacheId}`,
          JSON.stringify(stats),
          'EX',
          300
        );

        stats.hits = 0;
        stats.misses = 0;
      }
    }
  }

  private async updateCacheSize(cacheId: string) {
    const entries = await this.prisma.cacheEntry.findMany({
      where: { cacheId },
      select: { sizeBytes: true }
    });

    const totalBytes = entries.reduce((sum: number, e: any) => sum + Number(e.sizeBytes), 0);
    const sizeGB = totalBytes / (1024 ** 3);

    await this.prisma.cache.update({
      where: { id: cacheId },
      data: { sizeGB }
    });
  }

  private calculateDigest(data: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private incrementHit(cacheId: string) {
    const stats = this.cacheStats.get(cacheId);
    if (stats && stats.hits !== undefined) {
      stats.hits++;
    }
  }

  private incrementMiss(cacheId: string) {
    const stats = this.cacheStats.get(cacheId);
    if (stats && stats.misses !== undefined) {
      stats.misses++;
    }
  }
}