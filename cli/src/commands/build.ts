import { promises as fs } from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { ApiClient } from '../utils/api';
import { getConfig } from '../utils/config';
import { streamLogs } from '../utils/logs';
import { createTarball } from '../utils/tar';

export async function buildCommand(context: string, options: any) {
  const spinner = ora('Preparing build').start();

  try {
    const config = await getConfig();
    const api = new ApiClient(config);

    if (!config.token) {
      spinner.fail('Not authenticated. Please run "dbp login" first.');
      process.exit(1);
    }

    const projectId = options.project || config.defaultProject;
    if (!projectId) {
      spinner.fail('No project specified. Use --project or set a default with "dbp project use <id>"');
      process.exit(1);
    }

    spinner.text = 'Validating build context';

    const contextPath = path.resolve(context);
    const dockerfilePath = path.resolve(contextPath, options.file || 'Dockerfile');

    try {
      await fs.access(contextPath);
      await fs.access(dockerfilePath);
    } catch {
      spinner.fail(`Build context or Dockerfile not found: ${contextPath}`);
      process.exit(1);
    }

    spinner.text = 'Parsing build options';

    const platforms = options.platform
      ? (Array.isArray(options.platform) ? options.platform : [options.platform])
          .flatMap((p: string) => p.split(','))
      : ['linux/amd64'];

    const tags = options.tag
      ? (Array.isArray(options.tag) ? options.tag : [options.tag])
      : [];

    const buildArgs: Record<string, string> = {};
    if (options.buildArg) {
      const args = Array.isArray(options.buildArg) ? options.buildArg : [options.buildArg];
      for (const arg of args) {
        const [key, value] = arg.split('=');
        if (key && value) {
          buildArgs[key] = value;
        }
      }
    }

    const secrets: Record<string, string> = {};
    if (options.secret) {
      const secretList = Array.isArray(options.secret) ? options.secret : [options.secret];
      for (const secret of secretList) {
        const [id, source] = secret.split('=');
        if (id && source) {
          if (source.startsWith('src=')) {
            const filePath = source.substring(4);
            try {
              secrets[id] = await fs.readFile(filePath, 'utf-8');
            } catch {
              spinner.fail(`Failed to read secret file: ${filePath}`);
              process.exit(1);
            }
          } else {
            secrets[id] = source;
          }
        }
      }
    }

    spinner.text = 'Creating build context archive';

    const tarballPath = await createTarball(contextPath, {
      dockerfile: options.file,
      ignore: ['.git', 'node_modules', '.dockerignore']
    });

    spinner.text = 'Uploading build context';

    const contextSize = (await fs.stat(tarballPath)).size;
    const contextSizeMB = (contextSize / (1024 * 1024)).toFixed(2);

    spinner.text = `Uploading build context (${contextSizeMB} MB)`;

    const uploadResponse = await api.uploadContext(projectId, tarballPath);
    const contextUrl = uploadResponse.url;

    await fs.unlink(tarballPath);

    spinner.text = 'Scheduling build';

    const buildRequest = {
      projectId,
      dockerfile: options.file,
      context: contextUrl,
      platforms,
      tags,
      buildArgs,
      secrets,
      cacheFrom: options.cacheFrom,
      cacheTo: options.cacheTo,
      target: options.target,
      noCache: options.noCache,
      pull: options.pull,
      push: options.push,
      load: options.load
    };

    const { buildId, estimatedWaitSeconds } = await api.createBuild(buildRequest);

    spinner.succeed(`Build scheduled: ${chalk.cyan(buildId)}`);

    if (estimatedWaitSeconds > 0) {
      console.log(chalk.gray(`Estimated wait: ${estimatedWaitSeconds}s`));
    }

    console.log(chalk.bold('\nBuild Output:'));
    console.log(chalk.gray('─'.repeat(60)));

    const buildResult = await streamLogs(api, buildId, {
      progress: options.progress
    });

    console.log(chalk.gray('─'.repeat(60)));

    if (buildResult.status === 'success') {
      console.log(chalk.green('✓ Build completed successfully'));

      if (buildResult.digest) {
        console.log(`  ${chalk.gray('Digest:')} ${buildResult.digest}`);
      }

      if (buildResult.size) {
        const sizeMB = (buildResult.size / (1024 * 1024)).toFixed(2);
        console.log(`  ${chalk.gray('Size:')} ${sizeMB} MB`);
      }

      if (buildResult.cacheHitRate) {
        const percentage = (buildResult.cacheHitRate * 100).toFixed(1);
        console.log(`  ${chalk.gray('Cache hit rate:')} ${percentage}%`);
      }

      if (buildResult.cacheSavedSeconds) {
        console.log(`  ${chalk.gray('Time saved:')} ${buildResult.cacheSavedSeconds}s`);
      }

      if (tags.length > 0) {
        console.log(`  ${chalk.gray('Tags:')}`);
        for (const tag of tags) {
          console.log(`    - ${tag}`);
        }
      }

      if (options.metadataFile) {
        const metadata = {
          buildId,
          status: buildResult.status,
          digest: buildResult.digest,
          size: buildResult.size,
          tags,
          platforms,
          cacheHitRate: buildResult.cacheHitRate,
          duration: buildResult.duration,
          cacheSavedSeconds: buildResult.cacheSavedSeconds,
          timestamp: new Date().toISOString()
        };

        await fs.writeFile(
          options.metadataFile,
          JSON.stringify(metadata, null, 2)
        );

        console.log(`  ${chalk.gray('Metadata written to:')} ${options.metadataFile}`);
      }

      process.exit(0);
    } else {
      console.error(chalk.red('✗ Build failed'));
      if (buildResult.error) {
        console.error(`  ${chalk.gray('Error:')} ${buildResult.error}`);
      }
      process.exit(1);
    }

  } catch (error: any) {
    spinner.fail(`Build failed: ${error.message}`);
    process.exit(1);
  }
}