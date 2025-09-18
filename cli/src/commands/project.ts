import chalk from 'chalk';
import ora from 'ora';
import { ApiClient } from '../utils/api';
import { getConfig, saveConfig } from '../utils/config';

export const projectCommand = {
  async list() {
    const spinner = ora('Fetching projects').start();

    try {
      const config = await getConfig();
      const api = new ApiClient(config);

      if (!config.token) {
        spinner.fail('Not authenticated. Please run "dbp login" first.');
        process.exit(1);
      }

      const projects = await api.listProjects();
      spinner.stop();

      if (projects.length === 0) {
        console.log(chalk.yellow('No projects found.'));
        console.log(chalk.gray('Create one with: dbp project create <name>'));
        return;
      }

      console.log(chalk.bold('\nProjects:'));
      console.log(chalk.gray('─'.repeat(60)));

      for (const project of projects) {
        const isDefault = project.id === config.defaultProject;
        const marker = isDefault ? chalk.green('*') : ' ';

        console.log(
          `${marker} ${chalk.cyan(project.name)} ${chalk.gray(`(${project.id})`)}`
        );
        console.log(`  Region: ${project.region}`);
        console.log(`  Builds: ${project._count.builds}`);

        if (project.caches && project.caches.length > 0) {
          const totalCache = project.caches.reduce((sum, c) => sum + c.sizeGB, 0);
          const avgHitRate = project.caches.reduce((sum, c) => sum + c.hitRate, 0) / project.caches.length;
          console.log(`  Cache: ${totalCache.toFixed(1)} GB (${(avgHitRate * 100).toFixed(0)}% hit rate)`);
        }
      }

      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.gray('* = default project'));

    } catch (error: any) {
      spinner.fail(`Failed to fetch projects: ${error.message}`);
      process.exit(1);
    }
  },

  async create(name: string, options: any) {
    const spinner = ora('Creating project').start();

    try {
      const config = await getConfig();
      const api = new ApiClient(config);

      if (!config.token) {
        spinner.fail('Not authenticated. Please run "dbp login" first.');
        process.exit(1);
      }

      const project = await api.createProject(name, {
        region: options.region || 'us-east'
      });

      spinner.succeed(`Project created: ${chalk.cyan(project.name)}`);
      console.log(`  ID: ${project.id}`);
      console.log(`  Region: ${project.region}`);

      if (!config.defaultProject) {
        await saveConfig({ ...config, defaultProject: project.id });
        console.log(chalk.green('\n✓ Set as default project'));
      }

    } catch (error: any) {
      spinner.fail(`Failed to create project: ${error.message}`);
      process.exit(1);
    }
  },

  async use(projectId: string) {
    const spinner = ora('Setting default project').start();

    try {
      const config = await getConfig();
      const api = new ApiClient(config);

      if (!config.token) {
        spinner.fail('Not authenticated. Please run "dbp login" first.');
        process.exit(1);
      }

      const project = await api.getProject(projectId);
      await saveConfig({ ...config, defaultProject: projectId });

      spinner.succeed(`Default project set to: ${chalk.cyan(project.name)}`);

    } catch (error: any) {
      spinner.fail(`Failed to set default project: ${error.message}`);
      process.exit(1);
    }
  },

  async info(projectId?: string) {
    const spinner = ora('Fetching project info').start();

    try {
      const config = await getConfig();
      const api = new ApiClient(config);

      if (!config.token) {
        spinner.fail('Not authenticated. Please run "dbp login" first.');
        process.exit(1);
      }

      const id = projectId || config.defaultProject;
      if (!id) {
        spinner.fail('No project specified. Use --project or set a default with "dbp project use <id>"');
        process.exit(1);
      }

      const project = await api.getProject(id);
      const analytics = await api.getProjectAnalytics(id, 30);

      spinner.stop();

      console.log(chalk.bold('\nProject Information:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Name: ${chalk.cyan(project.name)}`);
      console.log(`ID: ${project.id}`);
      console.log(`Region: ${project.region}`);
      console.log(`Created: ${new Date(project.createdAt).toLocaleDateString()}`);

      console.log(chalk.bold('\nBuilder Configuration:'));
      console.log(`Size: ${project.builderSize.cpus} CPUs, ${project.builderSize.memoryGB} GB RAM`);
      console.log(`Build timeout: ${project.buildTimeoutMinutes} minutes`);
      console.log(`Autoscaling: ${project.autoscalingEnabled ? 'Enabled' : 'Disabled'}`);

      console.log(chalk.bold('\nCache Configuration:'));
      console.log(`Target (x86_64): ${project.cacheStorageTargetGB.x86_64} GB`);
      console.log(`Target (arm64): ${project.cacheStorageTargetGB.arm64} GB`);
      console.log(`Retention: ${project.cacheRetentionDays} days`);

      if (project.caches && project.caches.length > 0) {
        console.log(chalk.bold('\nCurrent Cache Usage:'));
        for (const cache of project.caches) {
          console.log(`${cache.architecture}: ${cache.sizeGB.toFixed(1)} GB (${(cache.hitRate * 100).toFixed(0)}% hit rate)`);
        }
      }

      console.log(chalk.bold('\n30-Day Statistics:'));
      console.log(`Total builds: ${analytics.summary.totalBuilds}`);
      console.log(`Success rate: ${(analytics.summary.successRate * 100).toFixed(1)}%`);
      console.log(`Total time: ${analytics.summary.totalMinutes.toFixed(0)} minutes`);
      console.log(`Time saved: ${analytics.summary.savedMinutes.toFixed(0)} minutes`);
      console.log(`Avg cache hit: ${(analytics.summary.averageCacheHitRate * 100).toFixed(1)}%`);

      console.log(chalk.gray('─'.repeat(60)));

    } catch (error: any) {
      spinner.fail(`Failed to fetch project info: ${error.message}`);
      process.exit(1);
    }
  }
};