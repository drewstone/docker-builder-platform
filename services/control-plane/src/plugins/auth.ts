import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    prisma: PrismaClient;
    redis: Redis;
    scheduler: any;
    builderManager: any;
    cacheManager: any;
  }
}

const authPluginImpl: FastifyPluginAsync<{ prisma: PrismaClient; redis: Redis }> = async (fastify, opts) => {
    fastify.decorate('authenticate', async function (
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> {
      try {
        const authorization = request.headers.authorization;

        if (!authorization) {
          return reply.code(401).send({ error: 'No authorization header' });
        }

        let token: string;

        if (authorization.startsWith('Bearer ')) {
          token = authorization.substring(7);
        } else if (authorization.startsWith('dbp_')) {
          token = authorization;
        } else {
          return reply.code(401).send({ error: 'Invalid authorization format' });
        }

        if (token.startsWith('dbp_')) {
          const dbToken = await opts.prisma.token.findFirst({
            where: {
              token: token
            }
          });

          if (!dbToken) {
            return reply.code(401).send({ error: 'Invalid token' });
          }

          if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
            return reply.code(401).send({ error: 'Token expired' });
          }

          await opts.prisma.token.update({
            where: { id: dbToken.id },
            data: { lastUsedAt: new Date() }
          });

          (request as any).user = {
            userId: dbToken.userId || '',
            organizationId: dbToken.organizationId || '',
            role: 'admin'
          };
        }

        try {
          const decoded = await fastify.jwt.verify(token);
          (request as any).user = decoded;
        } catch (err) {
          return reply.code(401).send({ error: 'Invalid token' });
        }
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Authentication error' });
      }
    });
};

export const authPlugin = fp(authPluginImpl, { name: 'auth-plugin' });