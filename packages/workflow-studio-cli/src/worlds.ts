import { cancel, isCancel, select, text } from '@clack/prompts';
import { readFile, writeFile } from 'node:fs/promises';

export const WORLD_OPTIONS = [
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

export type WorldChoice = (typeof WORLD_OPTIONS)[number]['value'];

const DEFAULT_ENV_FILES = ['.env.local', '.env'];

const ensureNotCancelled = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(1);
  }
  return value;
};

export async function detectDefaultEnvFile(cwd: string): Promise<string> {
  void cwd;
  return DEFAULT_ENV_FILES[0];
}

export async function promptEnvFileLocation(
  defaultFilename: string
): Promise<string> {
  const input = await text({
    message: 'Where should environment variables be stored?',
    defaultValue: defaultFilename,
    placeholder: defaultFilename,
    validate(_value) {
      return undefined;
    },
  });
  const trimmed = ensureNotCancelled(input).trim();
  return trimmed || defaultFilename;
}

export function getWorldLabel(world: WorldChoice): string {
  return WORLD_OPTIONS.find((option) => option.value === world)?.label ?? world;
}

export function isCommunityWorld(world: WorldChoice): boolean {
  return WORLD_OPTIONS.some(
    (option) => option.value === world && option.community
  );
}

export async function promptWorldChoice(): Promise<WorldChoice> {
  const selected = await select({
    message: 'Select a Workflow world',
    options: WORLD_OPTIONS.map((option) => ({
      value: option.value,
      label: `${option.label}${option.community ? ' *' : ''}`,
    })),
  });
  return ensureNotCancelled(selected) as WorldChoice;
}

const LOCAL_WORLD_ENV = {
  WORKFLOW_TARGET_WORLD: 'local',
} as const;

const ensureEndsWithNewline = (value: string) =>
  value.endsWith('\n') ? value : `${value}\n`;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

export async function writeEnvValues(
  filePath: string,
  entries: Record<string, string>
): Promise<boolean> {
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
}

const filterEntries = (
  entries: Record<string, string | undefined>
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] =>
      Boolean(entry[1] && entry[1].length > 0)
    )
  );
};

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

const promptPostgresConfig = async () => {
  const connection = await promptRequiredText({
    message: 'Postgres connection URL',
    defaultValue: 'postgres://world:world@localhost:5432/world',
  });
  const prefix = await promptOptionalText({
    message: 'Queue job prefix',
    defaultValue: 'workflow_',
  });
  const concurrency = await promptRequiredText({
    message: 'Worker concurrency',
    defaultValue: '10',
  });

  return filterEntries({
    WORKFLOW_TARGET_WORLD: '@workflow/world-postgres',
    WORKFLOW_POSTGRES_URL: connection,
    WORKFLOW_POSTGRES_JOB_PREFIX: prefix || 'workflow_',
    WORKFLOW_POSTGRES_WORKER_CONCURRENCY: concurrency,
  });
};

const promptJazzMode = async (): Promise<'cloud' | 'self-hosted'> => {
  const mode = await select({
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
  return ensureNotCancelled(mode) as 'cloud' | 'self-hosted';
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
    return filterEntries({
      WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
      JAZZ_API_KEY: apiKey,
      JAZZ_WORKER_ACCOUNT: workerAccount,
      JAZZ_WORKER_SECRET: workerSecret,
      JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
      JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint,
    });
  }

  const syncServer = await promptOptionalText({
    message: 'Jazz sync server URL',
    defaultValue: 'http://localhost:4200',
  });
  const registrySecret = await promptOptionalText({
    message: 'Jazz webhook registry secret (optional)',
  });

  return filterEntries({
    WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
    JAZZ_WORKER_ACCOUNT: workerAccount,
    JAZZ_WORKER_SECRET: workerSecret,
    JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
    JAZZ_WEBHOOK_REGISTRY_SECRET: registrySecret,
    JAZZ_SYNC_SERVER: syncServer,
    JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint,
  });
};

export async function collectWorldEntries(
  world: WorldChoice
): Promise<Record<string, string>> {
  if (world === 'local') {
    return { ...LOCAL_WORLD_ENV };
  }
  if (world === 'postgres') {
    return promptPostgresConfig();
  }
  return promptJazzConfig();
}
