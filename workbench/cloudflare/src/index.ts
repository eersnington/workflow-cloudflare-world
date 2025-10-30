import chalk from 'chalk';
import { startServer } from './server/wrangler.js';
import { runCLI } from './setup/cli.js';

const orange = chalk.hex('#F38020');
const white = chalk.hex('#FFFFFF');
const shadow = chalk.hex('#4A4A4A');

const cloudflare = `
 ██████╗██╗      ██████╗ ██╗   ██╗███████╗██╗      █████╗ ██████╗ ███████╗
██╔════╝██║     ██╔═══██╗██║   ██║██╔════╝██║     ██╔══██╗██╔══██╗██╔════╝
██║     ██║     ██║   ██║██║   ██║█████╗  ██║     ███████║██████╔╝█████╗  
██║     ██║     ██║   ██║██║   ██║██╔══╝  ██║     ██╔══██║██╔══██╗██╔══╝  
╚██████╗███████╗╚██████╔╝╚██████╔╝██║     ███████╗██║  ██║██║  ██║███████╗
 ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
                                                                          `;
const workflows = `
██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗███████╗██╗      ██████╗ ██╗    ██╗███████╗
██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔════╝██║     ██╔═══██╗██║    ██║██╔════╝
██║ █╗ ██║██║   ██║██████╔╝█████╔╝ █████╗  ██║     ██║   ██║██║ █╗ ██║███████╗
██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══╝  ██║     ██║   ██║██║███╗██║╚════██║
╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗██║     ███████╗╚██████╔╝╚███╔███╔╝███████║
 ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝
`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function showIntro() {
  console.clear();
  console.log();

  // Helper to render shadow text
  function renderShadowText(text: string, color: (t: string) => string) {
    const topPadding = 1;
    const leftPadding = 4;
    const shadowOffset = 1;

    console.log('\n'.repeat(topPadding));

    const lines = text.trimEnd().split('\n');
    const totalLines = lines.length;

    // Print shadow layer first
    lines.forEach((line, index) => {
      if (index > 0) process.stdout.write('\n');
      process.stdout.write(
        ' '.repeat(leftPadding + shadowOffset) + shadow.dim(line)
      );
    });

    // Move cursor up to render the colored text on top
    process.stdout.write(`\x1b[${totalLines}A`);

    // Print colored text layer
    lines.forEach((line) => {
      process.stdout.write('\n');
      process.stdout.write(' '.repeat(leftPadding) + color(line));
    });

    console.log();
  }

  renderShadowText(cloudflare, orange);
  renderShadowText(workflows, white);

  console.log();

  const frames = ['▲', '△', '▲', '△'];

  const cols = process.stdout.columns || 80;
  const center = Math.floor(cols / 2);

  for (let i = 0; i < 24; i++) {
    const f = frames[i % frames.length];
    const size = 3 + Math.round(Math.sin(i / 2) * 2);
    const color = i % 2 === 0 ? white : orange;
    const tri = f.repeat(size);
    const pad = ' '.repeat(center - Math.floor(size / 2));
    process.stdout.write(`\r${pad}${color(tri)}`);
    await sleep(100);
  }

  process.stdout.write('\n\n');
}

async function main() {
  await showIntro();

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
