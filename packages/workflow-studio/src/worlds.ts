import { cancel, isCancel, select, text } from '@clack/prompts';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

export const WORLD_OPTIONS = [
  {
    value: 'embedded',
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
export type WorldSelection = WorldChoice | 'skip';

export const WORLD_SKIP_VALUE = 'skip' as const;

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

export function getWorldLabelWithSkip(world: WorldSelection): string {
  if (world === WORLD_SKIP_VALUE) {
    return 'Skip';
  }
  return getWorldLabel(world);
}

export function isCommunityWorld(world: WorldChoice): boolean {
  return WORLD_OPTIONS.some(
    (option) => option.value === world && option.community
  );
}

export async function promptWorldChoice(): Promise<WorldChoice> {
  const selected = await select({
    message: 'Select a Workflow world (* - Community maintained)',
    options: WORLD_OPTIONS.map((option) => ({
      value: option.value,
      label: `${option.label}${option.community ? ' *' : ''}`,
    })),
  });
  return ensureNotCancelled(selected) as WorldChoice;
}

export async function promptWorldChoiceWithSkip(
  autoAccept: boolean,
  message?: string
): Promise<WorldSelection> {
  if (autoAccept) {
    return 'embedded';
  }

  const options = [
    ...WORLD_OPTIONS.map((option) => ({
      value: option.value,
      label: `${option.label}${option.community ? ' *' : ''}`,
    })),
    { value: WORLD_SKIP_VALUE, label: 'Skip for now' },
  ];

  const selected = await select({
    message:
      message ||
      'Which Workflow world do you want to use? (* - Community maintained)',
    options,
  });
  return ensureNotCancelled(selected) as WorldSelection;
}

const LOCAL_WORLD_ENV = {
  WORKFLOW_TARGET_WORLD: 'embedded',
} as const;

const ensureEndsWithNewline = (value: string) =>
  value.endsWith('\n') ? value : `${value}\n`;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const upsertEnvValue = (
  content: string,
  key: string,
  value: string,
  comment?: string
): string => {
  const commentLine = comment ? `# ${comment}\n` : '';
  const line = `${key}=${value}`;
  if (!content.trim()) {
    return `${commentLine}${line}\n`;
  }
  const pattern = new RegExp(`#.*\n${escapeRegex(key)}=.*$`, 'm');
  const linePattern = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');

  if (pattern.test(content)) {
    return content.replace(pattern, `${commentLine}${line}`);
  }
  if (linePattern.test(content)) {
    return content.replace(linePattern, `${commentLine}${line}`);
  }
  return `${content}${content.endsWith('\n') ? '' : '\n'}${commentLine}${line}\n`;
};

const openUrl = (url: string) => {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  spawn(start, [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
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

export async function writeEnvValuesWithComments(
  filePath: string,
  entries: Record<string, string>,
  comments: Record<string, string>
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
    const comment = comments[key];
    updated = upsertEnvValue(updated, key, value, comment);
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

const promptJazzConfig = async (): Promise<{
  entries: Record<string, string>;
  comments: Record<string, string>;
  mode: 'cloud' | 'self-hosted';
  useDefaults?: boolean;
}> => {
  const mode = await promptJazzMode();

  if (mode === 'cloud') {
    return await promptJazzCloudConfig();
  } else {
    return await promptJazzSelfHostedConfig();
  }
};

const promptJazzCloudConfig = async (): Promise<{
  entries: Record<string, string>;
  comments: Record<string, string>;
  mode: 'cloud';
}> => {
  console.log('\n🎶 Setting up Jazz Cloud for Workflow Studio');
  console.log('=====================================');

  const openDashboard = await select({
    message: 'Open Jazz Cloud Dashboard to create your account?',
    options: [
      { value: 'yes', label: 'Yes, open dashboard' },
      { value: 'no', label: 'No, I already have an account' },
    ],
  });

  if (ensureNotCancelled(openDashboard) === 'yes') {
    console.log('\nOpening Jazz Cloud Dashboard...');
    console.log('   1. Create a free account at https://dashboard.jazz.tools');
    console.log('   2. Create a new app (or use the default one)');
    console.log('   3. Create a "Workflow Worker" in the dashboard');
    console.log('   4. Copy the credentials from the worker settings\n');

    openUrl('https://dashboard.jazz.tools');

    await select({
      message: 'Press Enter when you have your credentials ready...',
      options: [{ value: 'continue', label: 'Continue' }],
    });
  }

  const apiKey = await promptRequiredText({
    message: 'Jazz API Key (from dashboard)',
  });
  const workerAccount = await promptRequiredText({
    message: 'Jazz Worker Account (from worker credentials)',
  });
  const workerSecret = await promptRequiredText({
    message: 'Jazz Worker Secret (from worker credentials)',
  });
  const webhookRegistryId = await promptRequiredText({
    message: 'Jazz Webhook Registry ID (from worker settings)',
  });
  const webhookEndpoint = await promptOptionalText({
    message: "Webhook Endpoint (your app's public URL)",
    defaultValue: 'http://localhost:3000',
  });

  const entries = {
    WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
    JAZZ_API_KEY: apiKey,
    JAZZ_WORKER_ACCOUNT: workerAccount,
    JAZZ_WORKER_SECRET: workerSecret,
    JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
    JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint || 'http://localhost:3000',
  };

  const comments = {
    WORKFLOW_TARGET_WORLD: 'Use workflow-world-jazz as the backend',
    JAZZ_API_KEY: 'Get this from https://dashboard.jazz.tools',
    JAZZ_WORKER_ACCOUNT: 'Worker account from Jazz Cloud dashboard',
    JAZZ_WORKER_SECRET: 'Worker secret from Jazz Cloud dashboard',
    JAZZ_WEBHOOK_REGISTRY_ID: 'Webhook registry ID from worker settings',
    JAZZ_WEBHOOK_ENDPOINT: "Your app's public URL (for production deployments)",
  };

  return { entries, comments, mode: 'cloud' };
};

const promptJazzSelfHostedConfig = async (): Promise<{
  entries: Record<string, string>;
  comments: Record<string, string>;
  mode: 'self-hosted';
  useDefaults?: boolean;
}> => {
  console.log('\nSetting up self-hosted Jazz for Workflow Studio');
  console.log('===============================================');

  const useDefaults = await select({
    message: 'Use recommended defaults for local development?',
    options: [
      {
        value: 'yes',
        label: 'Yes (recommended for getting started)',
      },
      {
        value: 'no',
        label: "No, I'll configure manually",
      },
    ],
  });

  if (ensureNotCancelled(useDefaults) === 'yes') {
    console.log('\nUsing default configuration for local Jazz setup');
    console.log('   You can start Jazz services with these commands:');
    console.log('   # Terminal 1: Start sync server');
    console.log('   pnpx jazz-run sync');
    console.log('   # Terminal 2: Create worker account');
    console.log(
      '   pnpx jazz-run account create --peer http://localhost:4200 --name "Workflow Worker" >> .env.local'
    );
    console.log('   # Terminal 3: Create webhook registry');
    console.log(
      '   pnpx env-cmd -f .env.local -x -- pnpx jazz-run webhook create-registry --peer http://localhost:4200 --grant $JAZZ_WORKER_ACCOUNT >> .env.local'
    );
    console.log('   # Terminal 4: Run webhook registry');
    console.log(
      '   pnpx env-cmd -f .env.local -- pnpx jazz-run webhook run --peer http://localhost:4200\n'
    );

    const entries = {
      WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
      JAZZ_SYNC_SERVER: 'http://localhost:4200',
      JAZZ_WEBHOOK_ENDPOINT: 'http://localhost:3000',
    };

    const comments = {
      WORKFLOW_TARGET_WORLD: 'Use workflow-world-jazz as the backend',
      JAZZ_SYNC_SERVER:
        'Local Jazz sync server URL (default: http://localhost:4200)',
      JAZZ_WEBHOOK_ENDPOINT:
        'Local development endpoint (default: http://localhost:3000)',
    };

    return { entries, comments, mode: 'self-hosted', useDefaults: true };
  }

  // Manual configuration
  const workerAccount = await promptRequiredText({
    message: 'Jazz Worker Account',
  });
  const workerSecret = await promptRequiredText({
    message: 'Jazz Worker Secret',
  });
  const webhookRegistryId = await promptRequiredText({
    message: 'Jazz Webhook Registry ID',
  });
  const syncServer = await promptOptionalText({
    message: 'Jazz Sync Server URL',
    defaultValue: 'http://localhost:4200',
  });
  const registrySecret = await promptOptionalText({
    message: 'Jazz Webhook Registry Secret (optional)',
  });
  const webhookEndpoint = await promptOptionalText({
    message: 'Webhook Endpoint (public URL)',
    defaultValue: 'http://localhost:3000',
  });

  const entries = filterEntries({
    WORKFLOW_TARGET_WORLD: 'workflow-world-jazz',
    JAZZ_WORKER_ACCOUNT: workerAccount,
    JAZZ_WORKER_SECRET: workerSecret,
    JAZZ_WEBHOOK_REGISTRY_ID: webhookRegistryId,
    JAZZ_SYNC_SERVER: syncServer,
    JAZZ_WEBHOOK_REGISTRY_SECRET: registrySecret,
    JAZZ_WEBHOOK_ENDPOINT: webhookEndpoint,
  });

  const comments = {
    WORKFLOW_TARGET_WORLD: 'Use workflow-world-jazz as the backend',
    JAZZ_WORKER_ACCOUNT: 'Your Jazz worker account identifier',
    JAZZ_WORKER_SECRET: 'Your Jazz worker secret key',
    JAZZ_WEBHOOK_REGISTRY_ID: 'Webhook registry CoValue ID',
    JAZZ_SYNC_SERVER: 'Sync server URL (default: http://localhost:4200)',
    JAZZ_WEBHOOK_REGISTRY_SECRET: 'Webhook registry secret for self-hosting',
    JAZZ_WEBHOOK_ENDPOINT: "Your app's public URL or localhost for development",
  };

  return { entries, comments, mode: 'self-hosted', useDefaults: false };
};

export async function collectWorldEntries(
  world: WorldChoice
): Promise<Record<string, string>> {
  if (world === 'embedded') {
    return { ...LOCAL_WORLD_ENV };
  }
  if (world === 'postgres') {
    return promptPostgresConfig();
  }
  const jazzConfig = await promptJazzConfig();
  return jazzConfig.entries;
}

export async function collectWorldEntriesWithComments(
  world: WorldChoice
): Promise<{
  entries: Record<string, string>;
  comments: Record<string, string>;
  summary?: string[];
}> {
  if (world === 'embedded') {
    return {
      entries: { ...LOCAL_WORLD_ENV },
      comments: {
        WORKFLOW_TARGET_WORLD: 'Use local world for development and testing',
      },
    };
  }

  if (world === 'postgres') {
    const entries = await promptPostgresConfig();
    return {
      entries,
      comments: {
        WORKFLOW_TARGET_WORLD:
          'Use @workflow/world-postgres for production deployments',
        WORKFLOW_POSTGRES_URL: 'PostgreSQL connection string',
        WORKFLOW_POSTGRES_JOB_PREFIX: 'Prefix for workflow jobs in database',
        WORKFLOW_POSTGRES_WORKER_CONCURRENCY: 'Number of concurrent workers',
      },
    };
  }

  const jazzConfig = await promptJazzConfig();

  // Generate summary for Jazz setup
  const summary: string[] = [];
  if (jazzConfig.mode === 'cloud') {
    summary.push('✅ Jazz Cloud configured successfully');
    summary.push('Next steps:');
    summary.push('   1. Run: npm add workflow-world-jazz');
    summary.push('   2. Start your app: npm dev');
    summary.push(
      '   3. Enable webhooks in Jazz Cloud dashboard for production'
    );
  } else {
    if (jazzConfig.useDefaults) {
      summary.push('✅ Self-hosted Jazz configured with defaults');
      summary.push('Next steps:');
      summary.push('   1. Run: npm add workflow-world-jazz');
      summary.push('   2. Start Jazz services (see commands above)');
      summary.push('   3. Start your app: npm dev');
    } else {
      summary.push('✅ Self-hosted Jazz configured manually');
      summary.push('Next steps:');
      summary.push('   1. Run: npm add workflow-world-jazz');
      summary.push('   2. Start your sync server and webhook registry');
      summary.push('   3. Start your app: npm dev');
    }
  }

  return {
    entries: jazzConfig.entries,
    comments: jazzConfig.comments,
    summary,
  };
}

export async function collectWorldEntriesWithSkip(
  selection: WorldSelection
): Promise<Record<string, string> | null> {
  if (selection === WORLD_SKIP_VALUE) {
    return null;
  }
  return collectWorldEntries(selection);
}
