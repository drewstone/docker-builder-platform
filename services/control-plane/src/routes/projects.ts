import { FastifyPluginAsync } from 'fastify';
import { CreateProjectSchema, UpdateProjectSettingsSchema } from '../types';

const projectRoutes: FastifyPluginAsync = async (server) => {
  server.post('/', {
    preHandler: server.authenticate,
    schema: {
      body: CreateProjectSchema
    }
  }, async (request, reply) => {
    const data = request.body as any;
    const user = (request as any).user;

    const existing = await server.prisma.project.findFirst({
      where: {
        name: data.name,
        organizationId: user.organizationId
      }
    });

    if (existing) {
      return reply.code(409).send({ error: 'Project already exists' });
    }

    const project = await server.prisma.project.create({
      data: {
        ...data,
        organizationId: user.organizationId
      }
    });

    for (const arch of ['x86_64', 'arm64']) {
      await server.prisma.cache.create({
        data: {
          projectId: project.id,
          architecture: arch
        }
      });
    }

    return reply.send(project);
  });

  server.get('/', {
    preHandler: server.authenticate
  }, async (request, reply) => {
    const user = (request as any).user;

    const projects = await server.prisma.project.findMany({
      where: {
        organizationId: user.organizationId
      },
      include: {
        _count: {
          select: {
            builds: true
          }
        },
        caches: {
          select: {
            architecture: true,
            sizeGB: true,
            hitRate: true
          }
        }
      }
    });

    return reply.send(projects);
  });

  server.get('/:projectId', {
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
      },
      include: {
        caches: true,
        _count: {
          select: {
            builds: true,
            tokens: true
          }
        }
      }
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    return reply.send(project);
  });

  server.patch('/:projectId/settings', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      },
      body: UpdateProjectSettingsSchema
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const updates = request.body as any;
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

    const updated = await server.prisma.project.update({
      where: { id: projectId },
      data: updates
    });

    return reply.send(updated);
  });

  server.delete('/:projectId', {
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

    await server.prisma.cacheEntry.deleteMany({
      where: {
        cache: {
          projectId
        }
      }
    });

    await server.prisma.cache.deleteMany({
      where: { projectId }
    });

    await server.prisma.build.deleteMany({
      where: { projectId }
    });

    await server.prisma.token.deleteMany({
      where: { projectId }
    });

    await server.prisma.trustRelation.deleteMany({
      where: { projectId }
    });

    await server.prisma.project.delete({
      where: { id: projectId }
    });

    return reply.send({ success: true });
  });

  server.get('/:projectId/usage', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', default: 30 }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const { days } = request.query as any;
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

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const builds = await server.prisma.build.findMany({
      where: {
        projectId,
        createdAt: {
          gte: since
        }
      }
    });

    const stats = {
      totalBuilds: builds.length,
      successfulBuilds: builds.filter(b => b.status === 'success').length,
      failedBuilds: builds.filter(b => b.status === 'error').length,
      totalBuildMinutes: builds.reduce((sum, b) => sum + (b.duration || 0) / 60, 0),
      cacheSavedMinutes: builds.reduce((sum, b) => sum + b.cacheSavedSeconds / 60, 0),
      averageCacheHitRate: builds.reduce((sum, b) => sum + b.cacheHitRate, 0) / Math.max(builds.length, 1),
      billableMinutes: builds.reduce((sum, b) => sum + b.billableMinutes, 0)
    };

    return reply.send(stats);
  });
};

export default projectRoutes;