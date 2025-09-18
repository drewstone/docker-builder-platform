export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  database: {
    url: process.env.DATABASE_URL || 'postgresql://builduser:buildpass123@localhost:5432/buildplatform'
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: 0
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
    expiresIn: '7d'
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
  },

  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
  },

  buildkit: {
    defaultHost: process.env.BUILDKIT_HOST || 'localhost:8080',
    timeout: parseInt(process.env.BUILDKIT_TIMEOUT || '300000', 10)
  },

  cache: {
    defaultSizeGB: parseInt(process.env.CACHE_DEFAULT_SIZE_GB || '50', 10),
    defaultRetentionDays: parseInt(process.env.CACHE_RETENTION_DAYS || '14', 10)
  },

  builders: {
    defaultSize: {
      cpus: 16,
      memoryGB: 32
    },
    regions: ['us-east', 'us-west', 'eu-central'],
    architectures: ['x86_64', 'arm64']
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT || '9091', 10)
  }
};