#!/usr/bin/env node
import { input, select } from '@inquirer/prompts';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

interface QueueConfig {
  workflow: string;
  step: string;
}

interface DispatchConfig {
  mode: 'binding' | 'url';
  value: string;
}

interface AssetsConfig {
  directory: string;
  binding: string;
}

interface ContainerConfig {
  enabled: boolean;
  instanceType:
    | 'lite'
    | 'basic'
    | 'standard-1'
    | 'standard-2'
    | 'standard-3'
    | 'standard-4';
  maxInstances: number;
  sleepAfter: string;
}

const queueHandlerTemplate = `import {
  StreamCoordinator,
  WorkflowExecutorContainer,
  handleQueueMessage,
  type CloudflareEnv,
  type MessageBatch,
} from 'workflow-cloudflare-world';

export { StreamCoordinator, WorkflowExecutorContainer };

export async function queue(
  batch: MessageBatch,
  env: CloudflareEnv
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await handleQueueMessage(env, message);
      if (result?.retryAfterSeconds) {
        message.retry({ delaySeconds: result.retryAfterSeconds });
      } else {
        message.ack();
      }
    } catch (error) {
      console.error('Failed to dispatch queue message', error);
      message.retry();
    }
  }
}
`;

const MIGRATION_FILENAME = '0000_workflow_cloudflare.sql';

const banner =
  '\n╭──────────────────────────────────────────────╮\n│  Workflow Cloudflare World Configuration CLI │\n╰──────────────────────────────────────────────╯\n';

async function main(): Promise<void> {
  console.log(banner);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'Interactive prompts require a TTY. Please run this command directly in a local terminal (not through pnpm piping or a non-interactive shell).'
    );
    process.exit(1);
  }

  const workerName = await input({
    message: 'Worker name',
    default: 'workflow-world',
  });

  const d1Binding = await input({
    message: 'D1 binding name',
    default: 'DB',
  });

  const d1DatabaseName = await input({
    message: 'D1 database name',
    default: 'workflow-db',
  });

  const queueConfig: QueueConfig = {
    workflow: await input({
      message: 'Workflow queue name',
      default: 'workflow-queue',
    }),
    step: await input({
      message: 'Step queue name',
      default: 'step-queue',
    }),
  };

  const r2Bucket = await input({
    message: 'R2 bucket name',
    default: 'workflow-streams',
  });

  const deploymentId = await input({
    message: 'Deployment identifier (used when creating runs)',
    default: workerName,
  });

  const dispatchConfig: DispatchConfig = {
    mode: 'binding',
    value: await input({
      message:
        'Service binding name (apps will use this to call the world internally)',
      default: 'WORKFLOW_DISPATCH',
    }),
  };

  const entryPointInput = await input({
    message:
      'Built Worker entry file (value for wrangler "main", e.g. dist/index.js)',
    default: 'build/index.js',
  });
  const entryPoint = entryPointInput.trim().length
    ? entryPointInput.trim()
    : 'build/index.js';

  const assetsDirectoryInput = await input({
    message:
      'Static assets directory for Wrangler assets binding (leave blank to skip)',
    default: '.cloudflare/assets',
  });
  const assetsDirectory =
    assetsDirectoryInput.trim().length > 0 ? assetsDirectoryInput.trim() : null;
  let assetsConfig: AssetsConfig | null = null;
  if (assetsDirectory) {
    const assetsBinding = await input({
      message: 'Assets binding name',
      default: 'ASSETS',
    });
    assetsConfig = {
      directory: assetsDirectory,
      binding: assetsBinding.trim().length ? assetsBinding.trim() : 'ASSETS',
    };
  }

  const migrationsDirInput = await input({
    message:
      'D1 migrations directory (wrangler reads *.sql here when applying migrations)',
    default: 'migrations',
  });
  const migrationsDirRelative = migrationsDirInput.trim().length
    ? migrationsDirInput.trim()
    : 'migrations';
  const migrationsDirAbsolute = resolve(process.cwd(), migrationsDirRelative);
  // Container configuration - always enabled for workflow execution
  const containerConfig: ContainerConfig = {
    enabled: true,
    instanceType: 'basic',
    maxInstances: 10,
    sleepAfter: '10m',
  };

  // Configure container settings
  containerConfig.instanceType = await select({
    message: 'Container instance type (choose based on workflow complexity)',
    choices: [
      {
        name: 'lite (1/16 vCPU, 256 MiB, 2 GB) - Simple workflows',
        value: 'lite',
      },
      {
        name: 'basic (1/4 vCPU, 1 GiB, 4 GB) - Most workflows',
        value: 'basic',
      },
      {
        name: 'standard-1 (1/2 vCPU, 4 GiB, 8 GB) - Complex workflows',
        value: 'standard-1',
      },
      {
        name: 'standard-2 (1 vCPU, 6 GiB, 12 GB) - Heavy workflows',
        value: 'standard-2',
      },
      {
        name: 'standard-3 (2 vCPU, 8 GiB, 16 GB) - Very heavy workflows',
        value: 'standard-3',
      },
      {
        name: 'standard-4 (4 vCPU, 12 GiB, 20 GB) - Maximum workflows',
        value: 'standard-4',
      },
    ] as const,
    default: 'basic',
  });

  containerConfig.maxInstances = parseInt(
    await input({
      message: 'Maximum concurrent container instances',
      default: '10',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num < 1 || num > 100) {
          return 'Please enter a number between 1 and 100';
        }
        return true;
      },
    }),
    10
  );

  containerConfig.sleepAfter = await select({
    message: 'Container warming period (how long to keep containers warm)',
    choices: [
      { name: '5 minutes (faster warm-up, higher cost)', value: '5m' },
      { name: '10 minutes (balanced)', value: '10m' },
      { name: '30 minutes (slower warm-up, lower cost)', value: '30m' },
      { name: '1 hour (maximum savings)', value: '1h' },
    ] as const,
    default: '10m',
  });

  const migrationFilePath = await ensureMigrationFile(migrationsDirAbsolute);

  const wranglerSnippet = await createWranglerSnippet({
    workerName,
    d1Binding,
    d1DatabaseName,
    queueConfig,
    r2Bucket,
    deploymentId,
    dispatchConfig,
    entryPoint,
    migrationsDir: migrationsDirRelative,
    assets: assetsConfig,
    containerConfig,
  });

  const configPathInput = await input({
    message: 'Path to write Wrangler config (leave blank to skip)?',
    default: 'wrangler.json',
  });
  const configPath =
    configPathInput.trim().length > 0
      ? resolve(process.cwd(), configPathInput.trim())
      : null;

  if (configPath) {
    await ensureDir(dirname(configPath));
    await writeFile(
      configPath,
      JSON.stringify(wranglerSnippet, null, 2),
      'utf-8'
    );
    console.log(`\n\u001b[32m✨ Wrote config to ${configPath}\u001b[0m`);
  }

  const queueFileInput = await input({
    message:
      'Path to create queue handler + StreamCoordinator export (leave blank to skip)?',
    default: 'src/worker.ts',
  });
  const queueFilePath =
    queueFileInput.trim().length > 0
      ? resolve(process.cwd(), queueFileInput.trim())
      : null;

  if (queueFilePath) {
    await ensureDir(dirname(queueFilePath));
    await writeFile(queueFilePath, queueHandlerTemplate, 'utf-8');
    console.log(
      `\u001b[32m✨ Wrote queue handler to ${queueFilePath}\u001b[0m`
    );
  }

  printOutput({
    workerName,
    wranglerSnippet,
    dispatchConfig,
    d1DatabaseName,
    outputFile: configPath,
    queueFilePath,
    migrationFilePath,
  });
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function createWranglerSnippet({
  workerName,
  d1Binding,
  d1DatabaseName,
  queueConfig,
  r2Bucket,
  deploymentId,
  dispatchConfig,
  entryPoint,
  migrationsDir,
  assets,
  containerConfig,
}: {
  workerName: string;
  d1Binding: string;
  d1DatabaseName: string;
  queueConfig: QueueConfig;
  r2Bucket: string;
  deploymentId: string;
  dispatchConfig: DispatchConfig;
  entryPoint: string;
  migrationsDir: string;
  assets: AssetsConfig | null;
  containerConfig: ContainerConfig;
}): Record<string, unknown> {
  const baseConfig: Record<string, unknown> = {
    name: workerName,
    main: entryPoint,
    compatibility_date: '2025-11-10',
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [
      {
        binding: d1Binding,
        database_name: d1DatabaseName,
        migrations_dir: migrationsDir,
      },
    ],
    durable_objects: {
      bindings: [
        {
          name: 'STREAM_COORDINATOR',
          class_name: 'StreamCoordinator',
        },
      ],
    },
    migrations: [
      {
        tag: 'v1',
        new_sqlite_classes: ['StreamCoordinator'],
      },
    ],
    queues: {
      producers: [
        { binding: 'WORKFLOW_QUEUE', queue: queueConfig.workflow },
        { binding: 'STEP_QUEUE', queue: queueConfig.step },
      ],
      consumers: [
        {
          queue: queueConfig.workflow,
          max_batch_size: 10,
          max_batch_timeout: 5,
        },
        {
          queue: queueConfig.step,
          max_batch_size: 10,
          max_batch_timeout: 5,
        },
      ],
    },
    r2_buckets: [
      {
        binding: 'STREAM_BUCKET',
        bucket_name: r2Bucket,
      },
    ],
    vars: {
      DEPLOYMENT_ID: deploymentId,
      WORKFLOW_TARGET_WORLD: 'workflow-cloudflare-world',
      ...(dispatchConfig.mode === 'url'
        ? { WORKFLOW_DISPATCH_URL: dispatchConfig.value }
        : {}),
    },
  };

  // Add container configuration (always enabled for workflow execution)
  (baseConfig as any).containers = [
    {
      max_instances: containerConfig.maxInstances,
      class_name: 'WorkflowExecutorContainer',
      image: './Dockerfile',
      instance_type: containerConfig.instanceType,
      rollout_active_grace_period: 300,
      rollout_step_percentage: [10, 100],
    },
  ];

  // Add container DO binding
  (baseConfig.durable_objects as any).bindings.push({
    name: 'WORKFLOW_EXECUTOR',
    class_name: 'WorkflowExecutorContainer',
  });

  // Update migrations to include container
  (baseConfig.migrations as any)[0].new_sqlite_classes.push(
    'WorkflowExecutorContainer'
  );

  // Update queue consumers to use script_name for all deployments
  (baseConfig.queues as any).consumers = [
    {
      queue: queueConfig.workflow,
      script_name: workerName,
      max_batch_size: 10,
      max_batch_timeout: 5,
    },
    {
      queue: queueConfig.step,
      script_name: workerName,
      max_batch_size: 10,
      max_batch_timeout: 5,
    },
  ];

  if (assets) {
    baseConfig.assets = {
      binding: assets.binding,
      directory: assets.directory,
    };
  }

  // Add services section if using service binding
  if (dispatchConfig.mode === 'binding') {
    baseConfig.services = [
      {
        binding: dispatchConfig.value,
        service: workerName,
      },
    ];
  }

  return baseConfig;
}

function printOutput({
  workerName,
  wranglerSnippet,
  dispatchConfig,
  d1DatabaseName,
  outputFile,
  queueFilePath,
  migrationFilePath,
}: {
  workerName: string;
  wranglerSnippet: Record<string, unknown>;
  dispatchConfig: DispatchConfig;
  d1DatabaseName: string;
  outputFile: string | null;
  queueFilePath: string | null;
  migrationFilePath: string;
}): void {
  if (!outputFile) {
    console.log(
      '\nAdd the following snippet to your wrangler configuration:\n'
    );
    console.log(JSON.stringify(wranglerSnippet, null, 2));
  } else {
    console.log(
      `\nReview ${outputFile} and merge it into your wrangler config.`
    );
  }

  console.log('\nNext steps:');
  const bullet = (msg: string) => console.log(`\u001b[36m•\u001b[0m ${msg}`);
  if (queueFilePath) {
    bullet(
      `Queue handler scaffolded at ${queueFilePath}. Re-export it from your framework entry so Wrangler picks up both fetch routes and the queue handler.`
    );
  } else {
    bullet(
      'Create a worker entry that exports StreamCoordinator + queue handler as shown above.'
    );
  }
  const deployCommands = `Run:\n   \u001b[33mwrangler d1 create ${d1DatabaseName}\u001b[0m (first time only)\n   \u001b[33mwrangler d1 migrations apply ${d1DatabaseName}\u001b[0m\n   \u001b[33mwrangler deploy\u001b[0m (containers take 2-3 minutes to provision)\n   \u001b[33mwrangler containers list\u001b[0m (check container status)`;

  bullet(deployCommands);

  bullet(
    `Baseline D1 migration saved at ${migrationFilePath}. Add future SQL files in the same directory.`
  );

  if (dispatchConfig.mode === 'binding') {
    console.log(
      `\n\u001b[35mService binding "${dispatchConfig.value}" lets other Workers invoke ${workerName} internally.\u001b[0m\nAdd this to any consumer Worker that should call the world:\n\n"services": [\n  { "binding": "${dispatchConfig.value}", "service": "${workerName}" }\n]\n`
    );
  } else {
    console.log(
      `\nRemember to keep ${dispatchConfig.value} private—queue consumers will call your workflow endpoints over HTTPS.`
    );
  }
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const migrationSourceCandidates = [
  resolve(moduleDir, 'drizzle', 'migrations', MIGRATION_FILENAME),
  resolve(
    moduleDir,
    '..',
    '..',
    'src',
    'drizzle',
    'migrations',
    MIGRATION_FILENAME
  ),
];

async function ensureMigrationFile(targetDir: string): Promise<string> {
  await ensureDir(targetDir);
  const targetPath = join(targetDir, MIGRATION_FILENAME);
  const exists = await pathExists(targetPath);
  if (exists) {
    return targetPath;
  }

  const sql = await readMigrationTemplate();
  await writeFile(targetPath, sql, 'utf-8');
  console.log(`\u001b[32m✨ Wrote D1 migration to ${targetPath}\u001b[0m`);
  return targetPath;
}

async function readMigrationTemplate(): Promise<string> {
  for (const candidate of migrationSourceCandidates) {
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Unable to locate the bundled D1 migration template. Rebuild workflow-cloudflare-world before running the CLI.'
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
}

main().catch((error) => {
  if (error && typeof error === 'object' && 'isTtyError' in error) {
    console.error(
      '\nInteractive prompts require a TTY. Run this command directly in your terminal (not through pnpm piping).'
    );
  } else if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'ExitPromptError'
  ) {
    console.error('\nPrompt cancelled. No files were written.');
  } else {
    console.error('\nFailed to generate configuration:', error);
  }
  process.exit(1);
});
