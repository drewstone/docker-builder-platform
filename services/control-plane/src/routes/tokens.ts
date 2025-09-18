import { FastifyPluginAsync } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { CreateTokenSchema } from '../types';

const tokenRoutes: FastifyPluginAsync = async (server) => {
  server.post('/', {
    preHandler: server.authenticate,
    schema: {
      body: CreateTokenSchema
    }
  }, async (request, reply) => {
    const data = request.body as any;
    const user = (request as any).user;

    const tokenValue = `dbp_${uuidv4().replace(/-/g, '')}`;

    const token = await server.prisma.token.create({
      data: {
        ...data,
        token: tokenValue,
        organizationId: user.organizationId,
        userId: user.userId
      }
    });

    return reply.send({
      ...token,
      value: tokenValue
    });
  });

  server.get('/', {
    preHandler: server.authenticate
  }, async (request, reply) => {
    const user = (request as any).user;

    const tokens = await server.prisma.token.findMany({
      where: {
        organizationId: user.organizationId
      },
      select: {
        id: true,
        name: true,
        type: true,
        scope: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true
      }
    });

    return reply.send(tokens);
  });

  server.delete('/:tokenId', {
    preHandler: server.authenticate,
    schema: {
      params: {
        type: 'object',
        properties: {
          tokenId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { tokenId } = request.params as any;
    const user = (request as any).user;

    const token = await server.prisma.token.findFirst({
      where: {
        id: tokenId,
        organizationId: user.organizationId
      }
    });

    if (!token) {
      return reply.code(404).send({ error: 'Token not found' });
    }

    await server.prisma.token.delete({
      where: { id: tokenId }
    });

    return reply.send({ success: true });
  });
};

export default tokenRoutes;