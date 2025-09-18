import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ApiClient } from '../utils/api';
import { saveConfig, getConfig } from '../utils/config';
import { saveCredentials } from '../utils/credentials';

export async function loginCommand(options: any) {
  const spinner = ora();

  try {
    const config = await getConfig();
    const api = new ApiClient(config);

    if (options.token) {
      spinner.start('Validating token');

      try {
        const user = await api.validateToken(options.token);
        await saveCredentials(options.token);
        await saveConfig({ ...config, token: options.token });

        spinner.succeed(`Logged in as ${chalk.cyan(user.email)}`);
        console.log(`Organization: ${chalk.gray(user.organization.name)}`);
        console.log(`Plan: ${chalk.gray(user.organization.plan)}`);
      } catch (error) {
        spinner.fail('Invalid token');
        process.exit(1);
      }
    } else {
      console.log(chalk.bold('Docker Build Platform Login\n'));

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'email',
          message: 'Email:',
          validate: (input) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(input) || 'Please enter a valid email';
          }
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
          validate: (input) => input.length >= 8 || 'Password must be at least 8 characters'
        }
      ]);

      spinner.start('Authenticating');

      try {
        const { user, token, organization } = await api.login(
          answers.email,
          answers.password
        );

        await saveCredentials(token);
        await saveConfig({ ...config, token });

        spinner.succeed(`Logged in as ${chalk.cyan(user.email)}`);
        console.log(`Organization: ${chalk.gray(organization.name)}`);
        console.log(`Plan: ${chalk.gray(organization.plan)}`);

        if (organization.billingStatus === 'trial') {
          console.log(
            chalk.yellow('\n⚠ Your organization is on a trial plan.')
          );
          console.log(
            chalk.gray('  Configure billing at https://app.buildplatform.io/billing')
          );
        }

        const projects = await api.listProjects();
        if (projects.length === 0) {
          console.log(chalk.yellow('\n⚠ No projects found.'));
          console.log(chalk.gray('  Create one with: dbp project create <name>'));
        } else if (!config.defaultProject) {
          const defaultProject = projects.find((p: any) => p.name === 'default') || projects[0];
          await saveConfig({
            ...config,
            token,
            defaultProject: defaultProject.id
          });
          console.log(`\nDefault project set to: ${chalk.cyan(defaultProject.name)}`);
        }

      } catch (error: any) {
        spinner.fail('Authentication failed');
        if (error.response?.status === 401) {
          console.error(chalk.red('Invalid email or password'));
        } else {
          console.error(chalk.red(error.message));
        }
        process.exit(1);
      }
    }
  } catch (error: any) {
    console.error(chalk.red(`Login failed: ${error.message}`));
    process.exit(1);
  }
}