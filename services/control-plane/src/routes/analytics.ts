import { FastifyPluginAsync } from 'fastify';

const analyticsRoutes: FastifyPluginAsync = async (server) => {
  server.get('/organization', {
    preHandler: server.authenticate,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', default: 30 }
        }
      }
    }
  }, async (request, reply) => {
    const { days } = request.query as any;
    const user = (request as any).user;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const usage = await server.prisma.usage.findMany({
      where: {
        organizationId: user.organizationId,
        date: {
          gte: since
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    const builds = await server.prisma.build.findMany({
      where: {
        project: {
          organizationId: user.organizationId
        },
        createdAt: {
          gte: since
        }
      }
    });

    const stats = {
      totalBuilds: builds.length,
      successRate: builds.filter((b: any) => b.status === 'success').length / Math.max(builds.length, 1),
      totalBuildMinutes: builds.reduce((sum: number, b: any) => sum + (b.duration || 0) / 60, 0),
      cacheSavedMinutes: builds.reduce((sum: number, b: any) => sum + b.cacheSavedSeconds / 60, 0),
      averageCacheHitRate: builds.reduce((sum: number, b: any) => sum + b.cacheHitRate, 0) / Math.max(builds.length, 1),
      dailyUsage: usage
    };

    return reply.send(stats);
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
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const dailyStats: Record<string, any> = {};

    for (const build of builds) {
      const date = build.createdAt.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          builds: 0,
          successful: 0,
          failed: 0,
          totalMinutes: 0,
          savedMinutes: 0,
          cacheHitRate: 0
        };
      }

      dailyStats[date].builds++;
      if (build.status === 'success') dailyStats[date].successful++;
      if (build.status === 'error') dailyStats[date].failed++;
      dailyStats[date].totalMinutes += (build.duration || 0) / 60;
      dailyStats[date].savedMinutes += build.cacheSavedSeconds / 60;
      dailyStats[date].cacheHitRate += build.cacheHitRate;
    }

    Object.values(dailyStats).forEach((day: any) => {
      if (day.builds > 0) {
        day.cacheHitRate /= day.builds;
      }
    });

    return reply.send({
      projectId,
      days: Object.values(dailyStats),
      summary: {
        totalBuilds: builds.length,
        successRate: builds.filter((b: any) => b.status === 'success').length / Math.max(builds.length, 1),
        totalMinutes: builds.reduce((sum: number, b: any) => sum + (b.duration || 0) / 60, 0),
        savedMinutes: builds.reduce((sum: number, b: any) => sum + b.cacheSavedSeconds / 60, 0),
        averageCacheHitRate: builds.reduce((sum: number, b: any) => sum + b.cacheHitRate, 0) / Math.max(builds.length, 1)
      }
    });
  });
};

export default analyticsRoutes;