import { type ChildProcess, spawn } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const orange = chalk.hex('#F38020');
const MAX_PORT_ATTEMPTS = 5;
const BASE_PORT = 8787;

export interface ServerInfo {
  url: string;
  port: number;
  stop: () => void;
}

export async function startServer(): Promise<ServerInfo> {
  const spinner = ora(orange('Starting Cloudflare Worker...')).start();

  let currentPort = BASE_PORT;
  let attempts = 0;

  while (attempts < MAX_PORT_ATTEMPTS) {
    try {
      const { process, port } = await attemptStart(currentPort);
      const url = `http://localhost:${port}`;

      spinner.succeed(chalk.white(`Worker ready on ${orange.bold(url)}`));

      return {
        url,
        port,
        stop: () => stopServer(process),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('port in use')) {
        currentPort++;
        attempts++;
        spinner.text = orange(
          `Port ${currentPort - 1} busy, trying ${currentPort}...`
        );
      } else {
        spinner.fail(chalk.white('Failed to start worker'));
        throw error;
      }
    }
  }

  throw new Error(
    `No available port found after ${MAX_PORT_ATTEMPTS} attempts`
  );
}

interface ProcessInfo {
  process: ChildProcess;
  port: number;
}

function attemptStart(port: number): Promise<ProcessInfo> {
  return new Promise((resolve, reject) => {
    const wrangler = spawn(
      'wrangler',
      ['dev', 'src/server/worker.ts', '--local', '--port', port.toString()],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        wrangler.kill();
        reject(new Error('Startup timeout'));
      }
    }, 30000);

    // Optional file logging setup
    const logToFile = process.env.WORKBENCH_WRANGLER_LOG === 'file';
    let logFile: string | null = null;
    if (logToFile) {
      const logDir = join(process.cwd(), '.logs');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      logFile = join(logDir, 'wrangler-dev.log');
    }

    function appendLog(data: string, isError = false): void {
      if (logFile) {
        const timestamp = new Date().toISOString();
        const prefix = isError ? '[ERROR]' : '[INFO]';
        writeFileSync(logFile, `${timestamp} ${prefix} ${data}`, { flag: 'a' });
      }
    }

    wrangler.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();

      // Filter out noisy HTTP request logs
      const isHttpLog =
        /^\[wrangler:info\]\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i.test(
          output
        );

      if (!isHttpLog) {
        // Only show non-HTTP logs to TTY (startup messages, errors)
        process.stdout.write(chalk.gray(output));
      }

      // Always log to file if enabled
      appendLog(output);

      if (output.includes('Ready on')) {
        const match = output.match(/https?:\/\/[^\s]+:(\d+)/);
        const detectedPort = match ? Number.parseInt(match[1], 10) : port;

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ process: wrangler, port: detectedPort });
        }
      }

      if (output.toLowerCase().includes('address already in use')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          wrangler.kill();
          reject(new Error('port in use'));
        }
      }
    });

    wrangler.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();

      // Filter out noisy HTTP request logs from stderr too
      const isHttpLog =
        /^\[wrangler:info\]\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+/i.test(
          output
        );

      if (!isHttpLog) {
        // Only show non-HTTP errors to TTY
        process.stderr.write(chalk.red(output));
      }

      // Always log to file if enabled
      appendLog(output, true);

      if (output.toLowerCase().includes('address already in use')) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          wrangler.kill();
          reject(new Error('port in use'));
        }
      }
    });

    wrangler.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start: ${error.message}`));
      }
    });

    wrangler.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Wrangler exited with code ${code}`));
      }
    });
  });
}

function stopServer(serverProcess: ChildProcess): void {
  console.log(chalk.gray('\nShutting down server...'));
  serverProcess.kill('SIGTERM');

  setTimeout(() => {
    if (!serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
  }, 2000);
}
