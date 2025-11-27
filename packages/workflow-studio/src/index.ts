#!/usr/bin/env node
import { log } from '@clack/prompts';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { runInitCommand } from './commands/init.js';
import { proxyWorkflowCommand } from './commands/proxy.js';
import { generateManifestV2 } from './lib/manifest-v2.js';
import { runWorldCommand } from './commands/world.js';

const [command, ...rest] = process.argv.slice(2);

async function showHelp() {
  log.message(
    `\n${pc.bold('workflow-studio')} — build, inspect, and design workflows`
  );
  log.message('\nUsage: workflow-studio <command> [options]');
  log.message('\nCommands:');
  log.message(
    '  init [name] [--template <framework>] [--example <example>] [--package-manager <pm>]'
  );
  log.message('  inspect <runs|steps|hooks> [...options]');
  log.message('  web');
  log.message('  world');
  log.message('\nExamples:');
  log.message(
    '  workflow-studio init my-app --template nextjs --example minimal'
  );
  log.message('  workflow-studio inspect runs --limit 5');
  log.message('  workflow-studio web');
  log.message('  workflow-studio world');
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    await showHelp();
    return;
  }

  if (command === 'world') {
    await runWorldCommand();
    return;
  }

  if (command === 'init') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: {
        template: { type: 'string' },
        example: { type: 'string' },
        yes: { type: 'boolean', default: false },
        'package-manager': { type: 'string' },
        pm: { type: 'string' },
      },
      allowPositionals: true,
    });

    await runInitCommand({
      projectName: positionals[0],
      template: values.template,
      example: values.example,
      yes: values.yes,
      packageManager: values['package-manager'] ?? values.pm,
    });
    return;
  }

  if (command === 'inspect') {
    await proxyWorkflowCommand('inspect', rest);
    return;
  }

  if (command === 'web') {
    if (rest.length > 0) {
      log.error(pc.red('The "web" command does not accept arguments.'));
      process.exitCode = 1;
      return;
    }
    const manifestPath = await generateManifestV2(process.cwd());
    if (manifestPath) {
      log.message(pc.cyan(`Generated workflow manifest v2 at ${manifestPath}`));
    }
    await proxyWorkflowCommand('web', []);
    return;
  }

  log.error(pc.red(`Unknown command "${command}"`));
  await showHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  log.error(pc.red(error.message));
  process.exitCode = 1;
});
