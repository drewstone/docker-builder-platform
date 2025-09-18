import chalk from 'chalk';
import { saveConfig, getConfig } from '../utils/config';
import { removeCredentials } from '../utils/credentials';

export async function logout() {
  try {
    const config = await getConfig();
    delete config.token;
    await saveConfig(config);
    await removeCredentials();

    console.log(chalk.green('✓ Logged out successfully'));
  } catch (error: any) {
    console.error(chalk.red(`Failed to logout: ${error.message}`));
    process.exit(1);
  }
}