import {
  cancel,
  intro,
  isCancel,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import pc from 'picocolors';

type WorldChoice = 'local' | 'postgres';

const WORLD_LABELS: Record<WorldChoice, string> = {
  local: 'Local world (@workflow/world-local)',
  postgres: 'Postgres world (@workflow/world-postgres)',
};

const DEFAULT_ENV_FILES = ['.env.local', '.env'];

const ensureNotCancelled = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(1);
  }
  return value;
};

const fileExists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureEndsWithNewline = (value: string) =>
  value.endsWith('\n') ? value : `${value}\n`;

const upsertEnvValue = (
  content: string,
  key: string,
  value: string
): string => {
  const line = `${key}=${value}`;
  if (!content.trim()) {
    return `${line}\n`;
  }
  const pattern = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content}${content.endsWith('\n') ? '' : '\n'}${line}\n`;
};

const writeEnvValues = async (
  filePath: string,
  entries: Record<string, string>
) => {
  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  let updated = existing;
  for (const [key, value] of Object.entries(entries)) {
    updated = upsertEnvValue(updated, key, value);
  }

  if (updated !== existing) {
    await writeFile(filePath, ensureEndsWithNewline(updated), 'utf8');
    return true;
  }
  return false;
};

const promptEnvFile = async (cwd: string): Promise<string> => {
  for (const filename of DEFAULT_ENV_FILES) {
    const candidate = join(cwd, filename);
    if (await fileExists(candidate)) {
      return filename;
    }
  }
  return DEFAULT_ENV_FILES[0];
};

const promptWorldChoice = async (): Promise<WorldChoice> => {
  const selected = await select({
    message: 'Select a Workflow world',
    options: (Object.keys(WORLD_LABELS) as WorldChoice[]).map((value) => ({
      value,
      label: WORLD_LABELS[value],
    })),
  });
  return ensureNotCancelled(selected) as WorldChoice;
};

const promptPostgresConfig = async () => {
  const connection = ensureNotCancelled(
    await text({
      message: 'Postgres connection URL',
      defaultValue: 'postgres://world:world@localhost:5432/world',
      validate(value) {
        if (!value || !value.trim()) {
          return 'Connection string is required';
        }
        return undefined;
      },
    })
  ).trim();

  const prefix = ensureNotCancelled(
    await text({
      message: 'Queue job prefix',
      defaultValue: 'workflow_',
    })
  ).trim();

  const concurrencyRaw = ensureNotCancelled(
    await text({
      message: 'Worker concurrency',
      defaultValue: '10',
      validate(value) {
        if (!value || !value.trim()) {
          return 'Worker concurrency is required';
        }
        return Number.isNaN(Number(value)) ? 'Provide a number' : undefined;
      },
    })
  ).trim();

  const concurrency = concurrencyRaw || '10';

  return {
    WORKFLOW_TARGET_WORLD: '@workflow/world-postgres',
    WORKFLOW_POSTGRES_URL: connection,
    WORKFLOW_POSTGRES_JOB_PREFIX: prefix || 'workflow_',
    WORKFLOW_POSTGRES_WORKER_CONCURRENCY: concurrency,
  };
};

const LOCAL_WORLD_ENV = {
  WORKFLOW_TARGET_WORLD: 'local',
};

export async function runWorldCommand() {
  intro(pc.cyan('Workflow Studio Worlds'));

  const invocationDir = resolve(process.cwd());
  const defaultEnvFile = await promptEnvFile(invocationDir);

  const envFileInput = ensureNotCancelled(
    await text({
      message: 'Where should environment variables be stored?',
      defaultValue: defaultEnvFile,
    })
  ).trim();

  const envFileRelative = envFileInput || defaultEnvFile;
  const envFilePath = resolve(invocationDir, envFileRelative);

  const world = await promptWorldChoice();

  let entries: Record<string, string> = LOCAL_WORLD_ENV;
  if (world === 'postgres') {
    entries = await promptPostgresConfig();
  }

  const spin = spinner();
  spin.start(
    `Updating ${relative(invocationDir, envFilePath) || envFileRelative}`
  );
  const changed = await writeEnvValues(envFilePath, entries);
  spin.stop(changed ? 'Environment updated' : 'Environment already up to date');

  const summaryLines = [
    `${pc.green('Configured')} ${pc.bold(relative(invocationDir, envFilePath) || envFileRelative)} for ${pc.yellow(WORLD_LABELS[world])}.`,
  ];

  if (world === 'postgres') {
    summaryLines.push(
      'Remember to run `pnpm exec workflow-postgres-setup` and seed your database before starting workers.'
    );
  }

  outro(summaryLines.join('\n'));
}
