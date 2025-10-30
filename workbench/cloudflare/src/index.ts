import { type ChildProcess, spawn } from 'node:child_process';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { runDemo } from './demo.js';

const orange = chalk.hex('#F38020');
const MAX_PORT_ATTEMPTS = 5;
const BASE_PORT = 8787;

interface ServerInfo {
  process: ChildProcess;
  port: number;
  url: string;
}

async function startWranglerServer(
  startPort: number = BASE_PORT
): Promise<ServerInfo> {
  const spinner = ora(
    orange('Starting Cloudflare Worker dev server...')
  ).start();

  let currentPort = startPort;
  let attempts = 0;

  while (attempts < MAX_PORT_ATTEMPTS) {
    try {
      const serverInfo = await attemptServerStart(currentPort, spinner);
      spinner.succeed(
        chalk.white(`Worker ready on ${orange.bold(serverInfo.url)}`)
      );
      return serverInfo;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('port in use') &&
        attempts < MAX_PORT_ATTEMPTS - 1
      ) {
        currentPort++;
        attempts++;
        spinner.text = orange(
          `Port ${currentPort - 1} busy, trying ${currentPort}...`
        );
      } else {
        spinner.fail(chalk.white('Failed to start worker server'));
        throw error;
      }
    }
  }

  throw new Error(
    `Could not find available port after ${MAX_PORT_ATTEMPTS} attempts`
  );
}

function attemptServerStart(port: number, spinner: Ora): Promise<ServerInfo> {
  return new Promise((resolve, reject) => {
    const args = ['dev', 'src/worker.ts', '--local', '--port', port.toString()];
    const wranglerProcess = spawn('wrangler', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        wranglerProcess.kill();
        reject(new Error('Wrangler server startup timeout'));
      }
    }, 30000);

    wranglerProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      stdoutBuffer += output;

      if (output.includes('Ready on')) {
        const match = output.match(/https?:\/\/[^\s]+:(\d+)/);
        const detectedPort = match ? Number.parseInt(match[1], 10) : port;

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            process: wranglerProcess,
            port: detectedPort,
            url: `http://localhost:${detectedPort}`,
          });
        }
      }

      if (output.toLowerCase().includes('address already in use')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          wranglerProcess.kill();
          reject(new Error('port in use'));
        }
      }
    });

    wranglerProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderrBuffer += output;

      if (output.toLowerCase().includes('address already in use')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          wranglerProcess.kill();
          reject(new Error('port in use'));
        }
      }
    });

    wranglerProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to start wrangler: ${error.message}\nIs wrangler installed? Run: pnpm add -g wrangler`
          )
        );
      }
    });

    wranglerProcess.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Wrangler exited with code ${code}\nStdout: ${stdoutBuffer}\nStderr: ${stderrBuffer}`
          )
        );
      }
    });
  });
}

function setupGracefulShutdown(serverProcess: ChildProcess) {
  const shutdown = () => {
    console.log(chalk.gray('\nShutting down...'));
    serverProcess.kill('SIGTERM');

    setTimeout(() => {
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 2000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    if (!serverProcess.killed) {
      serverProcess.kill();
    }
  });
}

async function main() {
  try {
    console.log(orange.bold('\n🚀 Cloudflare Workflow Demo\n'));

    const serverInfo = await startWranglerServer();
    setupGracefulShutdown(serverInfo.process);

    console.log(
      chalk.gray('Press Ctrl+C to stop the server and exit the demo\n')
    );

    await runDemo({ baseURL: serverInfo.url });
  } catch (error) {
    console.error(chalk.red('\n✗ Demo failed:'), error);
    process.exit(1);
  }
}

main();
