import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({
    err: error,
    request: {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query
    }
  }, 'Request error');

  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      validation: error.validation
    });
  }

  if (error.statusCode === 401) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (error.statusCode === 403) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Insufficient permissions'
    });
  }

  if (error.statusCode === 404) {
    return reply.status(404).send({
      error: 'Not Found',
      message: error.message || 'Resource not found'
    });
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  });
}