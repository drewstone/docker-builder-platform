import { FastifyPluginAsync } from 'fastify';

const cacheRoutes: FastifyPluginAsync = async (server) => {
  server.get('/project/:projectId', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const user = (request as any).user;

    const project = await server.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: user.organizationId
      }
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const stats = await server.cacheManager.getCacheStats(projectId);
    return reply.send(stats);
  });

  server.post('/project/:projectId/reset', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const user = (request as any).user;

    const project = await server.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: user.organizationId
      }
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    await server.cacheManager.resetCache(projectId);
    return reply.send({ success: true });
  });

  server.post('/project/:projectId/prune', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          targetSizeGB: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const { targetSizeGB } = request.body as any;
    const user = (request as any).user;

    const project = await server.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: user.organizationId
      }
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const prunedGB = await server.cacheManager.pruneCache(projectId, targetSizeGB);
    return reply.send({ prunedGB });
  });
};

export default cacheRoutes;