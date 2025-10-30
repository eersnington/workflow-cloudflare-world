import chalk from 'chalk';
import { startServer } from './server/wrangler.js';
import { runCLI } from './setup/cli.js';

const orange = chalk.hex('#F38020');

async function main() {
  console.log(orange.bold('\n🚀 Cloudflare Workflow Demo\n'));

  const server = await startServer();

  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  process.on('SIGINT', () => {
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
  });

  try {
    await runCLI(server.url);
  } catch (error) {
    console.error(chalk.red('\n✗ Demo failed:'), error);
    process.exit(1);
  } finally {
    server.stop();
  }
}

main();
