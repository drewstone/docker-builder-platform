import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ApiClient } from '../utils/api';
import { getConfig } from '../utils/config';

export const cacheCommand = {
  async stats(projectId?: string) {
    const spinner = ora('Fetching cache statistics').start();

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

      const stats = await api.getCacheStats(id);
      spinner.stop();

      console.log(chalk.bold('\nCache Statistics:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Total size: ${stats.totalSizeGB.toFixed(2)} GB`);
      console.log(`Total entries: ${stats.entryCount}`);
      console.log(`Overall hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

      if (Object.keys(stats.architectures).length > 0) {
        console.log(chalk.bold('\nBy Architecture:'));
        for (const [arch, archStats] of Object.entries(stats.architectures)) {
          console.log(`\n${chalk.cyan(arch)}:`);
          console.log(`  Size: ${archStats.sizeGB.toFixed(2)} GB`);
          console.log(`  Entries: ${archStats.entryCount}`);
          console.log(`  Hit rate: ${(archStats.hitRate * 100).toFixed(1)}%`);
          console.log(`  Last used: ${new Date(archStats.lastUsed).toLocaleString()}`);
        }
      }

      console.log(chalk.gray('─'.repeat(60)));

    } catch (error: any) {
      spinner.fail(`Failed to fetch cache statistics: ${error.message}`);
      process.exit(1);
    }
  },

  async reset(projectId?: string, options: any = {}) {
    const spinner = ora();

    try {
      const config = await getConfig();
      const api = new ApiClient(config);

      if (!config.token) {
        console.error(chalk.red('Not authenticated. Please run "dbp login" first.'));
        process.exit(1);
      }

      const id = projectId || config.defaultProject;
      if (!id) {
        console.error(chalk.red('No project specified. Use --project or set a default with "dbp project use <id>"'));
        process.exit(1);
      }

      if (!options.force) {
        const answer = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: chalk.yellow('Are you sure you want to reset the cache? This cannot be undone.'),
          default: false
        }]);

        if (!answer.confirm) {
          console.log('Cache reset cancelled.');
          return;
        }
      }

      spinner.start('Resetting cache');
      await api.resetCache(id);
      spinner.succeed('Cache reset successfully');

    } catch (error: any) {
      spinner.fail(`Failed to reset cache: ${error.message}`);
      process.exit(1);
    }
  },

  async prune(projectId?: string, options: any = {}) {
    const spinner = ora('Pruning cache').start();

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

      const targetGB = parseFloat(options.target || '50');
      const result = await api.pruneCache(id, targetGB);

      spinner.succeed(`Cache pruned: ${result.prunedGB.toFixed(2)} GB freed`);

    } catch (error: any) {
      spinner.fail(`Failed to prune cache: ${error.message}`);
      process.exit(1);
    }
  }
};