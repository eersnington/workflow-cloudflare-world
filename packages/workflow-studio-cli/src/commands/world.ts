import { intro, outro, spinner } from '@clack/prompts';
import { relative, resolve } from 'node:path';
import pc from 'picocolors';
import {
  collectWorldEntries,
  detectDefaultEnvFile,
  getWorldLabel,
  isCommunityWorld,
  promptEnvFileLocation,
  promptWorldChoice,
  writeEnvValues,
} from '../worlds.js';

export async function runWorldCommand() {
  intro(pc.cyan('Workflow Studio Worlds'));

  const invocationDir = resolve(process.cwd());
  const defaultEnvFile = await detectDefaultEnvFile(invocationDir);
  const envFileRelative = await promptEnvFileLocation(defaultEnvFile);
  const envFilePath = resolve(invocationDir, envFileRelative);

  const world = await promptWorldChoice();
  const entries = await collectWorldEntries(world);

  const spin = spinner();
  spin.start(
    `Updating ${relative(invocationDir, envFilePath) || envFileRelative}`
  );
  const changed = await writeEnvValues(envFilePath, entries);
  spin.stop(changed ? 'Environment updated' : 'Environment already up to date');

  const summaryLines = [
    `${pc.green('Configured')} ${pc.bold(relative(invocationDir, envFilePath) || envFileRelative)} for ${pc.yellow(
      getWorldLabel(world)
    )}.`,
  ];

  if (world === 'postgres') {
    summaryLines.push(
      'Remember to run `pnpm exec workflow-postgres-setup` and seed your database before starting workers.'
    );
  }

  if (world === 'jazz') {
    summaryLines.push(
      'Install the community world with `pnpm add workflow-world-jazz` if you have not already.'
    );
  }

  if (isCommunityWorld(world)) {
    summaryLines.push('* Community-maintained world implementation');
  }

  outro(summaryLines.join('\n'));
}
