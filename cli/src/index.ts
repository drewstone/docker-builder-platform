#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { buildCommand } from './commands/build';
import { loginCommand } from './commands/login';
import { projectCommand } from './commands/project';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { version } from '../package.json';

const program = new Command();

program
  .name('dbp')
  .description('Docker Build Platform CLI - High-performance builds with distributed caching')
  .version(version);

program
  .command('build')
  .description('Build Docker image (compatible with docker buildx build)')
  .option('-f, --file <path>', 'Dockerfile path', 'Dockerfile')
  .option('-t, --tag <tag...>', 'Image tags')
  .option('--platform <platforms...>', 'Target platforms (e.g., linux/amd64,linux/arm64)')
  .option('--push', 'Push image to registry after build')
  .option('--load', 'Load image into local Docker daemon')
  .option('--cache-from <source>', 'Cache sources to import')
  .option('--cache-to <dest>', 'Cache export destination')
  .option('--build-arg <arg...>', 'Build arguments')
  .option('--secret <secret...>', 'Build secrets')
  .option('--ssh <ssh...>', 'SSH agent forwarding')
  .option('--target <stage>', 'Target build stage')
  .option('--no-cache', 'Disable cache')
  .option('--pull', 'Always pull base images')
  .option('--project <id>', 'Project ID (defaults to configured project)')
  .option('--progress <type>', 'Progress output type (auto, plain, tty)', 'auto')
  .option('--output <type>', 'Output type (type=image,push=true)', 'type=image')
  .option('--metadata-file <path>', 'Write build metadata to file')
  .argument('[context]', 'Build context path', '.')
  .action(buildCommand);

program
  .command('login')
  .description('Authenticate with Docker Build Platform')
  .option('--token <token>', 'Use API token instead of interactive login')
  .action(loginCommand);

program
  .command('logout')
  .description('Log out from Docker Build Platform')
  .action(async () => {
    const { logout } = await import('./commands/logout');
    await logout();
  });

program
  .command('project')
  .description('Manage projects')
  .addCommand(
    new Command('list')
      .description('List all projects')
      .action(projectCommand.list)
  )
  .addCommand(
    new Command('create')
      .description('Create a new project')
      .argument('<name>', 'Project name')
      .option('--region <region>', 'Region', 'us-east')
      .action(projectCommand.create)
  )
  .addCommand(
    new Command('use')
      .description('Set default project')
      .argument('<id>', 'Project ID')
      .action(projectCommand.use)
  )
  .addCommand(
    new Command('info')
      .description('Show project information')
      .argument('[id]', 'Project ID (defaults to current)')
      .action(projectCommand.info)
  );

program
  .command('cache')
  .description('Manage build cache')
  .addCommand(
    new Command('stats')
      .description('Show cache statistics')
      .argument('[projectId]', 'Project ID')
      .action(cacheCommand.stats)
  )
  .addCommand(
    new Command('reset')
      .description('Reset project cache')
      .argument('[projectId]', 'Project ID')
      .option('--force', 'Skip confirmation')
      .action(cacheCommand.reset)
  )
  .addCommand(
    new Command('prune')
      .description('Prune cache to target size')
      .argument('[projectId]', 'Project ID')
      .option('--target <gb>', 'Target size in GB', '50')
      .action(cacheCommand.prune)
  );

program
  .command('config')
  .description('Manage CLI configuration')
  .addCommand(
    new Command('get')
      .description('Get configuration value')
      .argument('<key>', 'Configuration key')
      .action(configCommand.get)
  )
  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key')
      .argument('<value>', 'Configuration value')
      .action(configCommand.set)
  )
  .addCommand(
    new Command('list')
      .description('List all configuration')
      .action(configCommand.list)
  );

program
  .command('status')
  .description('Show platform status and builder health')
  .action(async () => {
    const { statusCommand } = await import('./commands/status');
    await statusCommand();
  });

program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(`Docker Build Platform CLI v${version}`);
    console.log(`Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
  });

program.addHelpText('after', `
${chalk.bold('Examples:')}
  $ dbp build -t myapp:latest --platform linux/amd64,linux/arm64 --push .
  $ dbp login
  $ dbp project create my-project
  $ dbp cache stats
  $ dbp config set default_project my-project-id

${chalk.bold('Environment Variables:')}
  DBP_TOKEN         Authentication token
  DBP_PROJECT       Default project ID
  DBP_API_URL       API endpoint (default: http://localhost:3000)
  NO_COLOR          Disable colored output

${chalk.bold('Documentation:')}
  https://github.com/your-org/docker-build-platform
`);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}