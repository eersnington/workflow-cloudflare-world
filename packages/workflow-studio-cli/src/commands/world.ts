import { intro, outro, spinner } from '@clack/prompts';
import { relative, resolve } from 'node:path';
import pc from 'picocolors';
import {
  collectWorldEntriesWithComments,
  detectDefaultEnvFile,
  getWorldLabel,
  isCommunityWorld,
  promptEnvFileLocation,
  promptWorldChoice,
  writeEnvValuesWithComments,
} from '../worlds.js';

export async function runWorldCommand() {
  intro(pc.cyan('Workflow Studio Worlds'));

  const invocationDir = resolve(process.cwd());
  const defaultEnvFile = await detectDefaultEnvFile(invocationDir);
  const envFileRelative = await promptEnvFileLocation(defaultEnvFile);
  const envFilePath = resolve(invocationDir, envFileRelative);

  const world = await promptWorldChoice();
  const config = await collectWorldEntriesWithComments(world);

  const spin = spinner();
  spin.start(
    `Updating ${relative(invocationDir, envFilePath) || envFileRelative}`
  );
  const changed = await writeEnvValuesWithComments(
    envFilePath,
    config.entries,
    config.comments
  );
  spin.stop(
    changed
      ? 'Environment updated with comments'
      : 'Environment already up to date'
  );

  const summaryLines = [
    `${pc.green('Configured')} ${pc.bold(relative(invocationDir, envFilePath) || envFileRelative)} for ${pc.yellow(
      getWorldLabel(world)
    )}.`,
    changed
      ? 'Environment updated with helpful comments.'
      : 'Environment already up to date.',
  ];

  if (world === 'postgres') {
    summaryLines.push(
      'Remember to run `pnpm exec workflow-postgres-setup` and seed your database before starting workers.'
    );
  }

  if (world === 'jazz') {
    if (config.summary && config.summary.length > 0) {
      summaryLines.push(...config.summary);
    } else {
      summaryLines.push(
        'Install the community world with `pnpm add workflow-world-jazz` if you have not already.'
      );
    }
  }

  if (isCommunityWorld(world)) {
    summaryLines.push('* Community-maintained world implementation');
  }

  outro(summaryLines.join('\n'));
}
