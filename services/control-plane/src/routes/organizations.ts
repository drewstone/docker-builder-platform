import { FastifyPluginAsync } from 'fastify';

const organizationRoutes: FastifyPluginAsync = async (server) => {
  server.get('/current', {
    preHandler: server.authenticate
  }, async (request, reply) => {
    const user = (request as any).user;

    const organization = await server.prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        _count: {
          select: {
            projects: true,
            users: true,
            runners: true
          }
        }
      }
    });

    return reply.send(organization);
  });
};

export default organizationRoutes;