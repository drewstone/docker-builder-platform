import chalk from 'chalk';
import ora from 'ora';
import { ApiClient } from '../utils/api';
import { getConfig } from '../utils/config';

export async function statusCommand() {
  const spinner = ora('Checking platform status').start();

  try {
    const config = await getConfig();
    const api = new ApiClient(config);

    const health = await api.getHealth();
    spinner.stop();

    console.log(chalk.bold('\nPlatform Status:'));
    console.log(chalk.gray('─'.repeat(60)));

    const statusIcon = health.status === 'healthy' ? chalk.green('✓') : chalk.red('✗');
    console.log(`${statusIcon} Overall: ${health.status}`);

    if (health.services) {
      console.log(chalk.bold('\nServices:'));
      for (const [service, status] of Object.entries(health.services)) {
        const icon = status === 'connected' || status.includes('ready')
          ? chalk.green('✓')
          : chalk.red('✗');
        console.log(`${icon} ${service}: ${status}`);
      }
    }

    if (config.token) {
      try {
        const org = await api.getOrganization();
        console.log(chalk.bold('\nOrganization:'));
        console.log(`Name: ${org.name}`);
        console.log(`Plan: ${org.plan}`);
        console.log(`Billing: ${org.billingStatus}`);
        console.log(`Projects: ${org._count.projects}`);
        console.log(`Users: ${org._count.users}`);
      } catch {
        // Not authenticated or org info not available
      }
    }

    console.log(chalk.gray('─'.repeat(60)));

    if (!config.token) {
      console.log(chalk.yellow('\n⚠ Not authenticated. Run "dbp login" to access all features.'));
    }

  } catch (error: any) {
    spinner.fail('Failed to check platform status');
    console.error(chalk.red(`API endpoint may be unavailable: ${error.message}`));
    console.log(chalk.gray(`Check your configuration with: dbp config list`));
    process.exit(1);
  }
}