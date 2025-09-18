import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get('/', async (_, reply) => {
    try {
      await server.prisma.$queryRaw`SELECT 1`;
      await server.redis.ping();

      const builders = await server.builderManager.listBuilders();
      const healthyBuilders = builders.filter((b: any) => b.status === 'ready').length;

      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
          builders: `${healthyBuilders}/${builders.length} ready`
        }
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as any).message
      });
    }
  });

  server.get('/ready', async (_, reply) => {
    try {
      await server.prisma.$queryRaw`SELECT 1`;
      await server.redis.ping();

      return reply.send({ ready: true });
    } catch {
      return reply.code(503).send({ ready: false });
    }
  });

  server.get('/live', async (_, reply) => {
    return reply.send({ alive: true });
  });
};

export default healthRoutes;