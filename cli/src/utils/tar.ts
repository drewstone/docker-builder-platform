import * as tar from 'tar-stream';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

interface TarOptions {
  dockerfile?: string;
  ignore?: string[];
}

export async function createTarball(
  contextPath: string,
  options: TarOptions = {}
): Promise<string> {
  const pack = tar.pack();
  const outputPath = path.join('/tmp', `build-context-${Date.now()}.tar.gz`);
  const output = createWriteStream(outputPath);
  const gzip = createGzip();

  const ignorePatterns = options.ignore || [];
  const dockerignorePath = path.join(contextPath, '.dockerignore');

  try {
    const dockerignore = await fs.readFile(dockerignorePath, 'utf-8');
    ignorePatterns.push(...dockerignore.split('\n').filter(line => line.trim()));
  } catch {
    // No .dockerignore file
  }

  async function addDirectory(dir: string, base: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(base, fullPath);

      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        await addDirectory(fullPath, base);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath);

        pack.entry({
          name: relativePath,
          size: stat.size,
          mode: stat.mode,
          mtime: stat.mtime
        }, content);
      }
    }
  }

  await addDirectory(contextPath, contextPath);

  if (options.dockerfile && options.dockerfile !== 'Dockerfile') {
    const dockerfilePath = path.join(contextPath, options.dockerfile);
    const content = await fs.readFile(dockerfilePath);
    const stat = await fs.stat(dockerfilePath);

    pack.entry({
      name: 'Dockerfile',
      size: stat.size,
      mode: stat.mode,
      mtime: stat.mtime
    }, content);
  }

  pack.finalize();

  await pipeline(pack, gzip, output);

  return outputPath;
}

function shouldIgnore(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      continue;
    }

    if (pattern.endsWith('/')) {
      if (path.startsWith(pattern) || path + '/' === pattern) {
        return true;
      }
    } else if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      if (regex.test(path)) {
        return true;
      }
    } else {
      if (path === pattern || path.startsWith(pattern + '/')) {
        return true;
      }
    }
  }

  return false;
}