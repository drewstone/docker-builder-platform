import { z } from 'zod';

export interface BuildRequest {
  buildId?: string;
  projectId: string;
  userId?: string;
  dockerfile?: string;
  context?: string;
  platforms: string[];
  tags?: string[];
  buildArgs?: Record<string, string>;
  secrets?: Record<string, string>;
  cacheFrom?: string;
  cacheTo?: string;
  push?: boolean;
  priority?: number;
  trace?: any;
}

export interface BuilderNode {
  id: string;
  architecture: 'x86_64' | 'arm64';
  region: string;
  status: 'provisioning' | 'ready' | 'busy' | 'unhealthy' | 'terminating';
  maxConcurrency: number;
  currentBuilds: number;
  cacheVolumes: string[];
  lastHeartbeat: Date;
  lastAssigned: Date;
  resources: {
    cpus: number;
    memoryGB: number;
  };
}

export interface BuilderConfig {
  architecture: string;
  region: string;
  resources: {
    cpus: number;
    memoryGB: number;
  };
  cacheVolumeId?: string;
}

export interface BuildResult {
  buildId: string;
  status: 'success' | 'error' | 'cancelled';
  duration: number;
  cacheHitRate: number;
  cacheSavedSeconds: number;
  logs?: string;
  error?: string;
  digest?: string | null;
  size?: number;
}

export interface ScheduleResult {
  buildId: string;
  status: string;
  position: number;
  estimatedWaitSeconds: number;
  builder: BuilderNode | null;
}

export interface CacheEntry {
  id: string;
  cacheId: string;
  buildId?: string;
  key: string;
  digest: string;
  sizeBytes: bigint;
  command?: string;
  lastUsedAt: Date;
  createdAt: Date;
}

export interface CacheStats {
  totalSizeGB: number;
  hitRate: number;
  entryCount: number;
  architectures: Record<string, {
    sizeGB: number;
    hitRate: number;
    entryCount: number;
    lastUsed: Date;
  }>;
  hits?: number;
  misses?: number;
}

export interface CachePolicy {
  targetSizeGB: number;
  retentionDays: number;
  evictionStrategy: 'lru' | 'lfu' | 'fifo';
}

export const CreateOrganizationSchema = z.object({
  name: z.string().min(3).max(50),
  plan: z.enum(['developer', 'startup', 'business']).default('developer')
});

export const CreateProjectSchema = z.object({
  name: z.string().min(3).max(50),
  region: z.string().default('us-east'),
  builderSize: z.object({
    cpus: z.number().min(1).max(64),
    memoryGB: z.number().min(1).max(256)
  }).optional(),
  cacheStorageTargetGB: z.object({
    x86_64: z.number().min(1).max(500),
    arm64: z.number().min(1).max(500)
  }).optional(),
  cacheRetentionDays: z.number().min(1).max(365).optional(),
  buildTimeoutMinutes: z.number().min(1).max(360).optional()
});

export const CreateBuildSchema = z.object({
  projectId: z.string().uuid(),
  dockerfile: z.string().optional(),
  context: z.string().optional(),
  platforms: z.array(z.string()).min(1),
  tags: z.array(z.string()).optional(),
  buildArgs: z.record(z.string()).optional(),
  secrets: z.record(z.string()).optional(),
  cacheFrom: z.string().optional(),
  cacheTo: z.string().optional(),
  push: z.boolean().optional()
});

export const CreateTokenSchema = z.object({
  name: z.string().min(3).max(50),
  type: z.enum(['user', 'project', 'ci']),
  scope: z.enum(['organization', 'project']),
  permissions: z.array(z.string()),
  projectId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional()
});

export const UpdateProjectSettingsSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  region: z.string().optional(),
  builderSize: z.object({
    cpus: z.number().min(1).max(64),
    memoryGB: z.number().min(1).max(256)
  }).optional(),
  cacheStorageTargetGB: z.object({
    x86_64: z.number().min(1).max(500),
    arm64: z.number().min(1).max(500)
  }).optional(),
  cacheRetentionDays: z.number().min(1).max(365).optional(),
  buildTimeoutMinutes: z.number().min(1).max(360).optional(),
  autoscalingEnabled: z.boolean().optional(),
  autoscalingThresholds: z.object({
    maxBuildsPerHost: z.number().optional(),
    scaleUpThreshold: z.number().optional(),
    scaleDownThreshold: z.number().optional()
  }).optional()
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  organizationName: z.string().min(3).max(50)
});