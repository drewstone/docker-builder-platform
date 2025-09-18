import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authPlugin } from './plugins/auth';
import { metricsPlugin } from './plugins/metrics';
import { config } from './config';
import { logger } from './utils/logger';
import { initializeDatabase } from './utils/database';
import { SchedulerService } from './services/scheduler';
import { BuilderManager } from './services/builderManager';
import { CacheManager } from './services/cacheManager';

const prisma = new PrismaClient();
const redis = new Redis(config.redis);

export const server = fastify({
  logger: true,
  requestIdLogLabel: 'requestId',
  disableRequestLogging: false,
  trustProxy: true
});

async function bootstrap() {
  try {
    await initializeDatabase(prisma);

    await server.register(helmet, {
      contentSecurityPolicy: false
    });

    await server.register(cors, {
      origin: config.cors.origin,
      credentials: true
    });

    await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    await server.register(jwt, {
      secret: config.jwt.secret
    });

    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Docker Build Platform API',
          description: 'High-performance build platform with distributed caching',
          version: '1.0.0'
        },
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'auth', description: 'Authentication endpoints' },
          { name: 'organizations', description: 'Organization management' },
          { name: 'projects', description: 'Project management' },
          { name: 'builds', description: 'Build operations' },
          { name: 'cache', description: 'Cache management' },
          { name: 'tokens', description: 'Token management' },
          { name: 'analytics', description: 'Analytics and metrics' }
        ]
      }
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      }
    });

    await server.register(authPlugin, { prisma, redis });
    await server.register(metricsPlugin);

    const schedulerService = new SchedulerService(prisma, redis);
    const builderManager = new BuilderManager(prisma, redis);
    const cacheManager = new CacheManager(prisma, redis);

    server.decorate('prisma', prisma);
    server.decorate('redis', redis);
    server.decorate('scheduler', schedulerService);
    server.decorate('builderManager', builderManager);
    server.decorate('cacheManager', cacheManager);

    await registerRoutes(server);

    server.setErrorHandler(errorHandler);

    await schedulerService.start();
    await builderManager.initialize();
    await cacheManager.initialize();

    await server.listen({
      port: config.port,
      host: '0.0.0.0'
    });

    logger.info(`Server listening on http://0.0.0.0:${config.port}`);
    logger.info(`API docs available at http://0.0.0.0:${config.port}/docs`);

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await server.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
});

bootstrap();