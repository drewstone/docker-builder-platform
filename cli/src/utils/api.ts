import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { Config } from './config';

export class ApiClient {
  private client: AxiosInstance;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl || process.env.DBP_API_URL || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (config.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${config.token}`;
    }
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/api/auth/login', {
      email,
      password
    });
    return response.data;
  }

  async validateToken(token: string) {
    const response = await this.client.get('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  }

  async listProjects() {
    const response = await this.client.get('/api/projects');
    return response.data;
  }

  async createProject(name: string, options: any = {}) {
    const response = await this.client.post('/api/projects', {
      name,
      ...options
    });
    return response.data;
  }

  async getProject(projectId: string) {
    const response = await this.client.get(`/api/projects/${projectId}`);
    return response.data;
  }

  async uploadContext(projectId: string, tarballPath: string) {
    const form = new FormData();
    form.append('context', createReadStream(tarballPath));
    form.append('projectId', projectId);

    const response = await this.client.post('/api/builds/context', form, {
      headers: {
        ...form.getHeaders()
      }
    });
    return response.data;
  }

  async createBuild(buildRequest: any) {
    const response = await this.client.post('/api/builds', buildRequest);
    return response.data;
  }

  async getBuild(buildId: string) {
    const response = await this.client.get(`/api/builds/${buildId}`);
    return response.data;
  }

  async getBuildLogs(buildId: string) {
    const response = await this.client.get(`/api/builds/${buildId}/logs`, {
      responseType: 'text'
    });
    return response.data;
  }

  async streamBuildLogs(buildId: string): Promise<WebSocket> {
    const wsUrl = (this.config.apiUrl || 'http://localhost:3000')
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');

    const ws = new WebSocket(`${wsUrl}/api/builds/${buildId}/stream`);

    if (this.config.token) {
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          token: this.config.token
        }));
      });
    }

    return ws;
  }

  async getCacheStats(projectId: string) {
    const response = await this.client.get(`/api/cache/project/${projectId}`);
    return response.data;
  }

  async resetCache(projectId: string) {
    const response = await this.client.post(`/api/cache/project/${projectId}/reset`);
    return response.data;
  }

  async pruneCache(projectId: string, targetSizeGB: number) {
    const response = await this.client.post(`/api/cache/project/${projectId}/prune`, {
      targetSizeGB
    });
    return response.data;
  }

  async getOrganization() {
    const response = await this.client.get('/api/organizations/current');
    return response.data;
  }

  async getAnalytics(days: number = 30) {
    const response = await this.client.get('/api/analytics/organization', {
      params: { days }
    });
    return response.data;
  }

  async getProjectAnalytics(projectId: string, days: number = 30) {
    const response = await this.client.get(`/api/analytics/project/${projectId}`, {
      params: { days }
    });
    return response.data;
  }

  async getHealth() {
    const response = await this.client.get('/health');
    return response.data;
  }
}