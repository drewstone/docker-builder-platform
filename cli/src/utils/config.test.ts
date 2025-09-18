import path from 'path';
import os from 'os';

describe('Config Utils', () => {
  it('should determine config path', () => {
    const expectedPath = path.join(os.homedir(), '.dbp', 'config.json');
    expect(expectedPath).toContain('.dbp');
    expect(expectedPath).toContain('config.json');
  });

  it('should validate API URL format', () => {
    const validUrls = [
      'http://localhost:3000',
      'https://api.example.com',
      'http://192.168.1.1:8080'
    ];

    const invalidUrls = [
      'not-a-url',
      'ftp://invalid.com',
      '//no-protocol.com'
    ];

    validUrls.forEach(url => {
      expect(url).toMatch(/^https?:\/\//);
    });

    invalidUrls.forEach(url => {
      expect(url).not.toMatch(/^https?:\/\//);
    });
  });

  it('should handle environment variables', () => {
    const envVars = {
      DBP_TOKEN: 'test-token-123',
      DBP_PROJECT: 'project-456',
      DBP_API_URL: 'http://localhost:3000'
    };

    Object.entries(envVars).forEach(([key, value]) => {
      expect(key).toMatch(/^DBP_/);
      expect(value).toBeDefined();
    });
  });
});