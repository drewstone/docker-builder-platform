import { FastifyPluginAsync } from 'fastify';
import { CreateBuildSchema } from '../types';

const buildRoutes: FastifyPluginAsync = async (server) => {
  server.post('/', {
    preHandler: server.authenticate,
    schema: {
      body: CreateBuildSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            buildId: { type: 'string' },
            status: { type: 'string' },
            position: { type: 'number' },
            estimatedWaitSeconds: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const buildRequest = request.body as any;
    const user = (request as any).user;

    const project = await server.prisma.project.findFirst({
      where: {
        id: buildRequest.projectId,
        organizationId: user.organizationId
      }
    });

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const result = await server.scheduler.scheduleBuild({
      ...buildRequest,
      userId: user.userId
    });

    return reply.send(result);
  });

  server.get('/:buildId', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { buildId } = request.params as any;
    const user = (request as any).user;

    const build = await server.prisma.build.findFirst({
      where: {
        id: buildId,
        project: {
          organizationId: user.organizationId
        }
      },
      include: {
        project: true,
        cacheEntries: true
      }
    });

    if (!build) {
      return reply.code(404).send({ error: 'Build not found' });
    }

    return reply.send(build);
  });

  server.get('/project/:projectId', {
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
          limit: { type: 'number', default: 30 },
          offset: { type: 'number', default: 0 },
          status: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { projectId } = request.params as any;
    const { limit, offset, status } = request.query as any;
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

    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    const [builds, total] = await Promise.all([
      server.prisma.build.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      }),
      server.prisma.build.count({ where })
    ]);

    return reply.send({
      builds,
      total,
      limit,
      offset
    });
  });

  server.delete('/:buildId', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { buildId } = request.params as any;
    const user = (request as any).user;

    const build = await server.prisma.build.findFirst({
      where: {
        id: buildId,
        project: {
          organizationId: user.organizationId
        }
      }
    });

    if (!build) {
      return reply.code(404).send({ error: 'Build not found' });
    }

    if (build.status === 'building') {
      await server.builderManager.stopBuild(buildId);
    }

    await server.prisma.build.update({
      where: { id: buildId },
      data: { status: 'cancelled' }
    });

    return reply.send({ success: true });
  });

  server.get('/:buildId/logs', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { buildId } = request.params as any;
    const user = (request as any).user;

    const build = await server.prisma.build.findFirst({
      where: {
        id: buildId,
        project: {
          organizationId: user.organizationId
        }
      }
    });

    if (!build) {
      return reply.code(404).send({ error: 'Build not found' });
    }

    const logs = await server.redis.get(`build:${buildId}:logs`);

    return reply.type('text/plain').send(logs || 'No logs available');
  });

  server.post('/:buildId/retry', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { buildId } = request.params as any;
    const user = (request as any).user;

    const build = await server.prisma.build.findFirst({
      where: {
        id: buildId,
        project: {
          organizationId: user.organizationId
        }
      }
    });

    if (!build) {
      return reply.code(404).send({ error: 'Build not found' });
    }

    if (build.status === 'building' || build.status === 'queued') {
      return reply.code(400).send({ error: 'Build is already in progress' });
    }

    const result = await server.scheduler.scheduleBuild({
      projectId: build.projectId,
      userId: user.userId,
      platforms: build.platforms,
      tags: build.imageTags
    });

    return reply.send(result);
  });
};

export default buildRoutes;