import chalk from 'chalk';
import { getConfig, getConfigValue, setConfigValue } from '../utils/config';

export const configCommand = {
  async get(key: string) {
    try {
      const value = await getConfigValue(key);

      if (value === undefined) {
        console.log(chalk.yellow(`Configuration key "${key}" not found`));
      } else {
        console.log(value);
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to get configuration: ${error.message}`));
      process.exit(1);
    }
  },

  async set(key: string, value: string) {
    try {
      await setConfigValue(key, value);
      console.log(chalk.green(`✓ Configuration updated: ${key} = ${value}`));
    } catch (error: any) {
      console.error(chalk.red(`Failed to set configuration: ${error.message}`));
      process.exit(1);
    }
  },

  async list() {
    try {
      const config = await getConfig();

      console.log(chalk.bold('\nConfiguration:'));
      console.log(chalk.gray('─'.repeat(60)));

      for (const [key, value] of Object.entries(config)) {
        if (key === 'token' && value) {
          console.log(`${key}: ${chalk.gray('***' + (value as string).slice(-4))}`);
        } else {
          console.log(`${key}: ${value || chalk.gray('(not set)')}`);
        }
      }

      console.log(chalk.gray('─'.repeat(60)));
    } catch (error: any) {
      console.error(chalk.red(`Failed to list configuration: ${error.message}`));
      process.exit(1);
    }
  }
};