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

const WORLD_OPTIONS = [
  {
    value: 'local',
    label: 'Local world (@workflow/world-local)',
    community: false,
  },
  {
    value: 'postgres',
    label: 'Postgres world (@workflow/world-postgres)',
    community: false,
  },
  {
    value: 'jazz',
    label: 'Jazz world (workflow-world-jazz)',
    community: true,
  },
] as const;

type WorldChoice = (typeof WORLD_OPTIONS)[number]['value'];

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
    options: WORLD_OPTIONS.map((option) => ({
      value: option.value,
      label: `${option.label}${option.community ? ' *' : ''}`,
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

const filterEnvEntries = (
  entries: Record<string, string | undefined>
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] =>
      Boolean(entry[1] && entry[1].length > 0)
    )
  );
};

const isCommunityWorld = (world: WorldChoice) =>
  WORLD_OPTIONS.some((option) => option.value === world && option.community);

const promptRequiredText = async ({
  message,
  defaultValue,
}: {
  message: string;
  defaultValue?: string;
}) => {
  return ensureNotCancelled(
    await text({
      message,
      defaultValue,
      validate(value) {
        if (!value || !value.trim()) {
          return 'This field is required';
        }
        return undefined;
      },
    })
  ).trim();
};

const promptOptionalText = async ({
  message,
  defaultValue,
}: {
  message: string;
  defaultValue?: string;
}) => {
  return ensureNotCancelled(
    await text({
      message,
      defaultValue,
    })
  ).trim();
};

const promptJazzMode = async () => {
  const selected = await select({
    message: 'How will you use Jazz?',
    options: [
      {
        value: 'cloud',
        label: 'Jazz Cloud (recommended)',
      },
      {
        value: 'self-hosted',
        label: 'Self-hosted (sync server & webhook registry)',
      },
    ],
  });
  return ensureNotCancelled(selected) as 'cloud' | 'self-hosted';
};

const promptJazzConfig = async () => {
  const mode = await promptJazzMode();

  const workerAccount = await promptRequiredText({
    message: 'Jazz worker account',
  });
  const workerSecret = await promptRequiredText({
    message: 'Jazz worker secret',
  });
  const webhookRegistryId = await promptRequiredText({
    message: 'Jazz webhook registry ID',
  });
  const webhookEndpoint = await promptOptionalText({
    message: 'Webhook endpoint (public URL)',
    defaultValue: 'http://localhost:3000',
  });

  if (mode === 'cloud') {
    const apiKey = await promptRequiredText({
      message: 'Jazz API key',
    });
    return {
      WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
      JAZZ_API_KEY: apiKey,
      JAZZ_WORKER_ACCOUNT: workerAccount,
      JAZZ_WORKER_SECRET: workerSecret,
      JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
      JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint,
    };
  }

  const syncServer = await promptOptionalText({
    message: 'Jazz sync server URL',
    defaultValue: 'http://localhost:4200',
  });
  const webhookRegistrySecret = await promptOptionalText({
    message: 'Jazz webhook registry secret (optional)',
  });

  return {
    WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
    JAZZ_WORKER_ACCOUNT: workerAccount,
    JAZZ_WORKER_SECRET: workerSecret,
    JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
    JAZZ_WEBHOOK_REGISTRY_SECRET: webhookRegistrySecret,
    JAZZ_SYNC_SERVER: syncServer,
    JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint,
  };
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

  let entries: Record<string, string | undefined> = LOCAL_WORLD_ENV;
  if (world === 'postgres') {
    entries = await promptPostgresConfig();
  } else if (world === 'jazz') {
    entries = await promptJazzConfig();
  }

  const spin = spinner();
  spin.start(
    `Updating ${relative(invocationDir, envFilePath) || envFileRelative}`
  );
  const filteredEntries = filterEnvEntries(entries);
  const changed = await writeEnvValues(envFilePath, filteredEntries);
  spin.stop(changed ? 'Environment updated' : 'Environment already up to date');

  const worldLabel =
    WORLD_OPTIONS.find((option) => option.value === world)?.label ?? world;
  const summaryLines = [
    `${pc.green('Configured')} ${pc.bold(relative(invocationDir, envFilePath) || envFileRelative)} for ${pc.yellow(worldLabel)}.`,
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
