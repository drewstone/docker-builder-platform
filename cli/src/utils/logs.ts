import chalk from 'chalk';
import { ApiClient } from './api';

interface BuildResult {
  status: string;
  duration?: number;
  digest?: string;
  size?: number;
  cacheHitRate?: number;
  cacheSavedSeconds?: number;
  error?: string;
}

export async function streamLogs(
  api: ApiClient,
  buildId: string,
  _options: { progress?: string } = {}
): Promise<BuildResult> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let checkInterval: NodeJS.Timeout;
    let lastLogPosition = 0;

    const checkBuildStatus = async () => {
      try {
        const build = await api.getBuild(buildId);

        if (build.status === 'building' || build.status === 'queued') {
          const logs = await api.getBuildLogs(buildId);
          if (logs && logs.length > lastLogPosition) {
            const newLogs = logs.substring(lastLogPosition);
            process.stdout.write(formatLogs(newLogs));
            lastLogPosition = logs.length;
          }
        }

        if (build.status === 'success' || build.status === 'error' || build.status === 'cancelled') {
          clearInterval(checkInterval);

          const logs = await api.getBuildLogs(buildId);
          if (logs && logs.length > lastLogPosition) {
            const newLogs = logs.substring(lastLogPosition);
            process.stdout.write(formatLogs(newLogs));
          }

          resolve({
            status: build.status,
            duration: build.duration,
            digest: build.digest,
            size: build.size,
            cacheHitRate: build.cacheHitRate,
            cacheSavedSeconds: build.cacheSavedSeconds,
            error: build.error
          });
        }
      } catch (error) {
        clearInterval(checkInterval);
        reject(error);
      }
    };

    checkInterval = setInterval(checkBuildStatus, 1000);
    checkBuildStatus();
  });
}

function formatLogs(logs: string): string {
  const lines = logs.split('\n');
  const formatted = lines.map(line => {
    if (line.includes('[CACHED]')) {
      return chalk.green(line);
    } else if (line.includes('[ERROR]')) {
      return chalk.red(line);
    } else if (line.includes('[WARNING]')) {
      return chalk.yellow(line);
    } else if (line.startsWith('#')) {
      return chalk.cyan(line);
    } else if (line.includes('=>')) {
      return chalk.gray(line);
    }
    return line;
  });

  return formatted.join('\n');
}