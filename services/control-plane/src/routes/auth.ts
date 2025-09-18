import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { LoginSchema, RegisterSchema } from '../types';

const authRoutes: FastifyPluginAsync = async (server) => {
  server.post('/register', {
    schema: {
      body: RegisterSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            user: { type: 'object' },
            token: { type: 'string' },
            organization: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, name, organizationName } = request.body as any;

    const existingUser = await server.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return reply.code(409).send({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const organization = await server.prisma.organization.create({
      data: {
        name: organizationName,
        plan: 'developer',
        billingStatus: 'trial'
      }
    });

    const user = await server.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'owner',
        organizationId: organization.id
      }
    });

    const defaultProject = await server.prisma.project.create({
      data: {
        name: 'default',
        organizationId: organization.id
      }
    });

    for (const arch of ['x86_64', 'arm64']) {
      await server.prisma.cache.create({
        data: {
          projectId: defaultProject.id,
          architecture: arch
        }
      });
    }

    const token = server.jwt.sign({
      userId: user.id,
      organizationId: organization.id,
      role: user.role
    });

    await server.prisma.token.create({
      data: {
        name: 'Initial login token',
        token: token.substring(0, 32),
        type: 'user',
        scope: 'organization',
        permissions: ['read', 'write', 'admin'],
        userId: user.id,
        organizationId: organization.id
      }
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: organization.id,
        name: organization.name,
        plan: organization.plan
      },
      token
    });
  });

  server.post('/login', {
    schema: {
      body: LoginSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            user: { type: 'object' },
            token: { type: 'string' },
            organization: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as any;

    const user = await server.prisma.user.findUnique({
      where: { email },
      include: {
        organization: true
      }
    });

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = server.jwt.sign({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role
    });

    await server.prisma.token.updateMany({
      where: {
        userId: user.id,
        type: 'user'
      },
      data: {
        lastUsedAt: new Date()
      }
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        plan: user.organization.plan
      },
      token
    });
  });

  server.get('/me', {
    preHandler: server.authenticate,
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            user: { type: 'object' },
            organization: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const user = await server.prisma.user.findUnique({
      where: { id: (request as any).user.userId },
      include: {
        organization: true
      }
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        plan: user.organization.plan,
        billingStatus: user.organization.billingStatus
      }
    });
  });

  server.post('/logout', {
    preHandler: server.authenticate
  }, async (_, reply) => {
    return reply.send({ success: true });
  });
};

export default authRoutes;