import { FastifyInstance } from 'fastify';
import authRoutes from './auth';
import organizationRoutes from './organizations';
import projectRoutes from './projects';
import buildRoutes from './builds';
import cacheRoutes from './cache';
import tokenRoutes from './tokens';
import analyticsRoutes from './analytics';
import healthRoutes from './health';

export async function registerRoutes(server: FastifyInstance) {
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(organizationRoutes, { prefix: '/api/organizations' });
  await server.register(projectRoutes, { prefix: '/api/projects' });
  await server.register(buildRoutes, { prefix: '/api/builds' });
  await server.register(cacheRoutes, { prefix: '/api/cache' });
  await server.register(tokenRoutes, { prefix: '/api/tokens' });
  await server.register(analyticsRoutes, { prefix: '/api/analytics' });
}