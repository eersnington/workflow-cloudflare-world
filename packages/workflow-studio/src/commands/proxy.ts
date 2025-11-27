import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);
const workflowBin = requireFromHere.resolve('@workflow/cli/bin/run.js');

export function proxyWorkflowCommand(
  subcommand: string,
  args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workflowBin, subcommand, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const message =
          signal !== null
            ? `workflow command exited with signal ${signal}`
            : `workflow command failed with status ${code}`;
        reject(new Error(message));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}
