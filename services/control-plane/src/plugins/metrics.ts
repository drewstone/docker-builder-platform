import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      httpRequestDuration: Histogram<string>;
      httpRequestTotal: Counter<string>;
      buildsTotal: Counter<string>;
      buildsInProgress: Gauge<string>;
      cacheHitRate: Gauge<string>;
    };
  }
}

export const metricsPlugin: FastifyPluginAsync = fp(
  async (fastify) => {
    collectDefaultMetrics();

    const httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status']
    });

    const httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status']
    });

    const buildsTotal = new Counter({
      name: 'builds_total',
      help: 'Total number of builds',
      labelNames: ['project', 'status']
    });

    const buildsInProgress = new Gauge({
      name: 'builds_in_progress',
      help: 'Number of builds currently in progress',
      labelNames: ['project']
    });

    const cacheHitRate = new Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate by project',
      labelNames: ['project', 'architecture']
    });

    fastify.decorate('metrics', {
      httpRequestDuration,
      httpRequestTotal,
      buildsTotal,
      buildsInProgress,
      cacheHitRate
    });

    fastify.addHook('onRequest', async (request, reply) => {
      (request as any).startTime = Date.now();
    });

    fastify.addHook('onResponse', async (request, reply) => {
      const duration = (Date.now() - (request as any).startTime) / 1000;
      const route = request.routerPath || request.url;

      httpRequestDuration
        .labels(request.method, route, reply.statusCode.toString())
        .observe(duration);

      httpRequestTotal
        .labels(request.method, route, reply.statusCode.toString())
        .inc();
    });

    fastify.get('/metrics', async (request, reply) => {
      reply.type('text/plain');
      return register.metrics();
    });
  },
  { name: 'metrics-plugin' }
);