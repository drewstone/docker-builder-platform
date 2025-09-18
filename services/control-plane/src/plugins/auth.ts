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
  interface FastifyRequest {
    user?: {
      userId: string;
      organizationId: string;
      role: string;
    };
  }
}

export const authPlugin: FastifyPluginAsync<{ prisma: PrismaClient; redis: Redis }> = fp(
  async (fastify, opts) => {
    fastify.decorate('authenticate', async function (
      request: FastifyRequest,
      reply: FastifyReply
    ) {
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

          request.user = {
            userId: dbToken.userId || '',
            organizationId: dbToken.organizationId || '',
            role: 'admin'
          };

          return;
        }

        try {
          const decoded = await fastify.jwt.verify(token);
          request.user = decoded as any;
        } catch (err) {
          return reply.code(401).send({ error: 'Invalid token' });
        }
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Authentication error' });
      }
    });
  },
  { name: 'auth-plugin' }
);