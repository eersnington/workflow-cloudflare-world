import {
  cancel,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import { spawn } from 'node:child_process';
import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import pc from 'picocolors';
import { getCodemodGlobs, type CodemodId } from '../codemods/index.js';
import {
  renderTemplate,
  type RenderTemplateContext,
} from '../utils/handlebars.js';
import {
  templates,
  type TemplateContext,
  type TemplateName,
} from '../templates/index.js';
import { runAstGrep } from '../utils/ast-grep.js';
import { writeTemplateFiles } from '../utils/files.js';
import {
  ensureProjectDirectoryReady,
  normalizeProjectName,
} from '../utils/project.js';
import {
  WORLD_SKIP_VALUE,
  collectWorldEntriesWithComments,
  detectDefaultEnvFile,
  getWorldLabel,
  isCommunityWorld,
  promptEnvFileLocation,
  promptWorldChoiceWithSkip,
  writeEnvValuesWithComments,
  type WorldChoice,
  type WorldSelection,
} from '../worlds.js';
import { fileURLToPath } from 'node:url';

type InitOptions = {
  projectName?: string;
  template?: string;
  example?: string;
  yes?: boolean;
  packageManager?: string;
};

const DEFAULT_PROJECT_NAME = 'workflow-studio-app';
const DEFAULT_PACKAGE_MANAGER = 'pnpm';

const PACKAGE_MANAGERS = {
  npm: {
    label: 'npm',
    description: 'Default Node.js package manager',
    nextFlag: '--use-npm',
    installArgs: (deps: string[]) => ['install', ...deps],
    runScript: (script: string) => `npm run ${script}`,
    createExecutor: {
      command: 'npx',
      args: [],
    },
  },
  pnpm: {
    label: 'pnpm',
    description: 'Fast, disk-efficient package manager',
    nextFlag: '--use-pnpm',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `pnpm ${script}`,
    createExecutor: {
      command: 'pnpm',
      args: ['dlx'],
    },
  },
  yarn: {
    label: 'yarn',
    description: 'Classic yarn package manager',
    nextFlag: '--use-yarn',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `yarn ${script}`,
    createExecutor: {
      command: 'yarn',
      args: ['dlx'],
    },
  },
  bun: {
    label: 'bun',
    description: 'Bun toolkit package manager',
    nextFlag: '--use-bun',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `bun run ${script}`,
    createExecutor: {
      command: 'bunx',
      args: [],
    },
  },
} as const;

type PackageManagerName = keyof typeof PACKAGE_MANAGERS;

const WORKSPACE_FILENAME = 'pnpm-workspace.yaml';

const detectPackageManager = (): PackageManagerName | null => {
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  if (ua.startsWith('npm')) return 'npm';
  return null;
};

const pathExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

async function findWorkspaceFile(startDir: string): Promise<string | null> {
  let current = startDir;
  while (true) {
    const candidate = join(current, WORKSPACE_FILENAME);
    if (await pathExists(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

async function withWorkspaceFileHidden<T>(
  startDir: string,
  fn: () => Promise<T>
): Promise<T> {
  const workspacePath = await findWorkspaceFile(startDir);
  if (!workspacePath) {
    return fn();
  }
  const backupPath = `${workspacePath}.workflow-studio-backup`;
  try {
    await rename(workspacePath, backupPath);
  } catch {
    return fn();
  }
  try {
    const result = await fn();
    await rename(backupPath, workspacePath);
    return result;
  } catch (error) {
    try {
      await rename(backupPath, workspacePath);
    } catch {
      // ignore
    }
    throw error;
  }
}

const ensureNotCancelled = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(1);
  }
  return value;
};

const resolveWorldSelection = async (
  autoAccept: boolean
): Promise<WorldSelection> => {
  return promptWorldChoiceWithSkip(
    autoAccept,
    'Which Workflow world do you want to use? (* - Community maintained)'
  );
};

const isTemplateName = (value: string): value is TemplateName => {
  return Object.prototype.hasOwnProperty.call(templates, value);
};

const resolveTemplateSelection = async (
  templateFlag: string | undefined,
  yes: boolean
): Promise<TemplateName> => {
  const templateEntries = Object.entries(templates).map(([value, meta]) => ({
    value,
    label: `${meta.label}`,
  }));

  if (templateFlag) {
    if (!isTemplateName(templateFlag)) {
      throw new Error(
        `Unknown template "${templateFlag}". Available templates: ${templateEntries
          .map((entry) => entry.value)
          .join(', ')}`
      );
    }
    return templateFlag as TemplateName;
  }

  if (yes) {
    return templateEntries[0]?.value as TemplateName;
  }

  const selected = await select({
    message: 'Which framework do you want to start with?',
    options: templateEntries,
  });
  return ensureNotCancelled(selected) as TemplateName;
};

const resolveExampleSelection = async (
  templateName: TemplateName,
  exampleFlag: string | undefined,
  yes: boolean
) => {
  const definition = templates[templateName];
  const exampleEntries = Object.entries(definition.examples).map(
    ([value, meta]) => ({
      value,
      label: `${meta.label} — ${meta.description}`,
    })
  );

  if (exampleFlag) {
    if (!definition.examples[exampleFlag]) {
      throw new Error(
        `Unknown example "${exampleFlag}" for template "${templateName}". Available examples: ${exampleEntries
          .map((entry) => entry.value)
          .join(', ')}`
      );
    }
    return exampleFlag;
  }

  if (yes) {
    return exampleEntries[0]?.value;
  }

  const selected = await select({
    message: 'Pick a starter example',
    options: exampleEntries,
  });
  return ensureNotCancelled(selected);
};

const resolvePackageManager = async (
  packageManagerFlag: string | undefined,
  yes: boolean
): Promise<PackageManagerName> => {
  const entries = Object.entries(PACKAGE_MANAGERS).map(([value, meta]) => ({
    value,
    label: `${meta.label} — ${meta.description}`,
  }));

  if (packageManagerFlag) {
    if (!PACKAGE_MANAGERS[packageManagerFlag as PackageManagerName]) {
      throw new Error(
        `Unknown package manager "${packageManagerFlag}". Available: ${entries
          .map((entry) => entry.value)
          .join(', ')}`
      );
    }
    return packageManagerFlag as PackageManagerName;
  }

  const detected = detectPackageManager();
  if (detected) {
    return detected;
  }

  if (yes) {
    return (detected || DEFAULT_PACKAGE_MANAGER) as PackageManagerName;
  }

  const selection = await select({
    message: 'Which package manager do you use?',
    options: entries,
  });

  return ensureNotCancelled(selection) as PackageManagerName;
};

const isWindows = process.platform === 'win32';
const isPathCommand = (value: string) =>
  value.includes('/') || value.includes('\\');
const resolveCommand = (bin: string) => {
  if (!isWindows || isPathCommand(bin)) {
    return bin;
  }
  return bin.endsWith('.cmd') ? bin : `${bin}.cmd`;
};

const getWorkflowStudioCommand = (packageManager: PackageManagerName) => {
  const executor = PACKAGE_MANAGERS[packageManager].createExecutor;
  const parts = [executor.command, ...executor.args, 'workflow-studio', 'web'];
  return parts.join(' ');
};

async function runCommand(
  command: string,
  args: string[],
  {
    cwd,
    label,
    successMessage,
    env,
    spinnerMessages,
    spinnerIntervalMs = 5000,
  }: {
    cwd: string;
    label?: string;
    successMessage?: string;
    env?: NodeJS.ProcessEnv;
    spinnerMessages?: string[];
    spinnerIntervalMs?: number;
  }
) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const quiet = Boolean(label || (spinnerMessages && spinnerMessages.length));
    const spin = quiet ? spinner() : null;
    const messagePool = spinnerMessages
      ? [...spinnerMessages].sort(() => Math.random() - 0.5)
      : [];
    const initialMessage = messagePool.shift() || label || '';
    if (spin && initialMessage) {
      spin.start(initialMessage);
    }
    let tickTimer: NodeJS.Timeout | null = null;
    if (spin && messagePool.length > 0) {
      tickTimer = setInterval(() => {
        const next = messagePool.shift();
        if (next && spin.message) {
          spin.message(next);
        }
        if (!messagePool.length && tickTimer) {
          clearInterval(tickTimer);
        }
      }, spinnerIntervalMs);
    }
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    if (quiet && child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (quiet && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        if (spin) {
          if (tickTimer) {
            clearInterval(tickTimer);
          }
          spin.stop(successMessage || label || 'Done');
        }
        resolvePromise();
        return;
      }
      if (spin) {
        spin.stop('Command failed');
      }
      if (tickTimer) {
        clearInterval(tickTimer);
      }
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      rejectPromise(
        new Error(
          `Command "${command} ${args.join(' ')}" exited with ${code}${
            output ? `\n${output}` : ''
          }`
        )
      );
    });
  });
}

async function runCodemods({
  projectDir,
  codemods,
}: {
  projectDir: string;
  codemods: CodemodId[];
}) {
  for (const codemodId of codemods) {
    const globs = getCodemodGlobs(codemodId);

    log.message(
      pc.blue(
        `\n> ast-grep codemod ${codemodId}${
          globs && globs.length
            ? ` ${globs.map((glob) => `--globs ${glob}`).join(' ')}`
            : ''
        }`
      )
    );
    try {
      await runAstGrep({
        codemodId,
        cwd: projectDir,
      });
    } catch (error) {
      throw new Error(
        `Failed to run ast-grep codemod "${codemodId}". Ensure @ast-grep/napi is installed and try again.\n${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

type FileFactoryMap =
  | Record<string, (ctx: TemplateContext) => string>
  | undefined;

async function writeFactories({
  targetDir,
  factories,
  projectName,
}: {
  targetDir: string;
  factories: FileFactoryMap;
  projectName: string;
}) {
  if (!factories) {
    return;
  }
  const files = Object.fromEntries(
    Object.entries(factories).map(([filePath, factory]) => [
      filePath,
      factory({ projectName }),
    ])
  );
  await writeTemplateFiles(targetDir, files);
}

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

async function resolveHandlebarsTemplatePath(handlebarsName: string) {
  const candidates = [
    join(packageRoot, 'src', 'handlebars', handlebarsName),
    join(packageRoot, 'handlebars', handlebarsName),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Handlebars template "${handlebarsName}" not found. Looked in ${candidates.join(
      ', '
    )}`
  );
}

async function scaffoldWithHandlebars({
  handlebarsName,
  targetDir,
  context,
}: {
  handlebarsName: string;
  targetDir: string;
  context: RenderTemplateContext;
}) {
  const templatePath = await resolveHandlebarsTemplatePath(handlebarsName);
  const spin = spinner();
  spin.start(`Creating project files from ${handlebarsName} template`);
  await renderTemplate(templatePath, targetDir, context);
  spin.stop('Project files created');
}

async function installWorkflowDeps({
  packageManager,
  projectDir,
  exampleName,
}: {
  packageManager: PackageManagerName;
  projectDir: string;
  exampleName: string;
}) {
  const baseDeps = ['workflow@latest'];
  const aiDeps = ['ai@^5.0.76', 'zod@^4.1.9'];

  const deps: string[] = [...baseDeps];

  // Add example-specific dependencies
  if (exampleName === 'ai') {
    deps.push(...aiDeps);
  }

  const args = PACKAGE_MANAGERS[packageManager].installArgs(deps);
  await withWorkspaceFileHidden(projectDir, () =>
    runCommand(packageManager, args, {
      cwd: projectDir,
      label: 'Installing dependencies',
      successMessage: 'Dependencies installed',
      spinnerMessages: [
        'Brewing durable workflows...',
        'Get workflow pilled early into your life.',
        'Teaching the AI some new workflow tricks...',
        'Chasing down flaky steps and retrying...',
        'Sharpening workflow directives for resilience...',
        'Packing snacks for sequential workflows...',
        'Calming down stuck runs with timeouts...',
        'Pinning workflows to the timeline...',
        'Teaching zod to guard your payloads...',
        'Keeping determinism hydrated...',
        'Aligning ids so resumes never forget...',
        'Consulting the ancient tome of orchestrators...',
        'Casting a “no-flake” charm on step retriers...',
        'Whispering secrets to the workflow scheduler...',
        'Lighting incense for smooth resumptions...',
        'Offering cookies to the idempotency gods...',
        'Listening for ghost runs in the event bus...',
        'Balancing the cosmic scales of retries...',
        'Giving your workflows capes (for durability)...',
        'Juggling signals (safely)...',
        'Tucking long-running jobs into cozy queues...',
        'Patching parachutes for failed steps...',
        'Polishing idempotency keys...',
      ],
    })
  );
}

async function ensureWorkflowScript(projectDir: string) {
  const packageJsonPath = join(projectDir, 'package.json');
  const raw = await readFile(packageJsonPath, 'utf8');
  const data = JSON.parse(raw) as {
    scripts?: Record<string, string>;
  };
  data.scripts ??= {};
  if (!data.scripts.workflow) {
    data.scripts.workflow = 'workflow-studio start example';
  }
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(data, null, 2)}\n`,
    'utf8'
  );
}

type WorldConfig = {
  envFileRelative: string;
  entries: Record<string, string>;
  comments?: Record<string, string>;
  summary?: string[];
};

async function collectWorldConfig({
  selection,
  projectDir,
  skipEnvPrompt,
}: {
  selection: WorldSelection;
  projectDir: string;
  skipEnvPrompt: boolean;
}): Promise<WorldConfig | null> {
  if (selection === WORLD_SKIP_VALUE) {
    return null;
  }

  const config = await collectWorldEntriesWithComments(
    selection as WorldChoice
  );
  const defaultEnvFile = await detectDefaultEnvFile(projectDir);
  const envFileRelative = skipEnvPrompt
    ? defaultEnvFile
    : await promptEnvFileLocation(defaultEnvFile);

  return {
    envFileRelative,
    entries: config.entries,
    comments: config.comments,
    summary: config.summary,
  };
}

async function applyWorldConfig({
  selection,
  projectDir,
  config,
}: {
  selection: WorldSelection;
  projectDir: string;
  config: WorldConfig | null;
}): Promise<string[] | null> {
  if (selection === WORLD_SKIP_VALUE) {
    return null;
  }
  if (!config) {
    return null;
  }

  // At this point, selection is guaranteed to be a WorldChoice
  const world = selection as WorldChoice;

  const envFilePath = join(projectDir, config.envFileRelative);
  const changed = await writeEnvValuesWithComments(
    envFilePath,
    config.entries,
    config.comments || {}
  );

  const summaryLines = [
    `${pc.green('Configured')} ${pc.bold(
      relative(projectDir, envFilePath) || config.envFileRelative
    )} for ${pc.yellow(getWorldLabel(world))}.`,
    changed
      ? 'Environment updated with helpful comments.'
      : 'Environment already up to date.',
  ];

  if (world === 'postgres') {
    summaryLines.push(
      'Remember to run `pnpm exec workflow-postgres-setup` before starting workers.'
    );
  }

  if (world === 'jazz') {
    if (config.summary && config.summary.length > 0) {
      summaryLines.push(...config.summary);
    } else {
      summaryLines.push(
        'Install the community world with `pnpm add workflow-world-jazz` if needed.'
      );
    }
  }

  if (isCommunityWorld(world)) {
    summaryLines.push('* Community-maintained world implementation');
  }

  return summaryLines;
}

export async function runInitCommand(options: InitOptions) {
  intro(pc.cyan('Workflow Studio'));

  const invocationDir = resolve(process.cwd());

  let projectNameInput = options.projectName;
  if (!projectNameInput) {
    if (options.yes) {
      projectNameInput = DEFAULT_PROJECT_NAME;
    } else {
      const promptedName = await text({
        message: 'Project name',
        defaultValue: DEFAULT_PROJECT_NAME,
      });
      projectNameInput = ensureNotCancelled(promptedName);
    }
  }

  const { specifier: projectSpecifier, usingCurrentDirectory } =
    normalizeProjectName(projectNameInput);
  const targetDir = usingCurrentDirectory
    ? invocationDir
    : resolve(invocationDir, projectSpecifier);
  await ensureProjectDirectoryReady({
    directory: targetDir,
    usingCurrentDirectory,
    displayName: usingCurrentDirectory ? '.' : projectSpecifier,
  });
  const projectDirName = basename(targetDir);

  const packageManager = await resolvePackageManager(
    options.packageManager,
    Boolean(options.yes)
  );

  const templateName: TemplateName = await resolveTemplateSelection(
    options.template,
    Boolean(options.yes)
  );
  const exampleName = await resolveExampleSelection(
    templateName,
    options.example,
    Boolean(options.yes)
  );

  const template = templates[templateName];
  const example = template.examples[exampleName];
  const worldSelection = await resolveWorldSelection(Boolean(options.yes));
  const worldConfig = await collectWorldConfig({
    selection: worldSelection,
    projectDir: targetDir,
    skipEnvPrompt: Boolean(options.yes),
  });

  const handlebarsName = template.handlebars ?? templateName;
  await scaffoldWithHandlebars({
    handlebarsName,
    targetDir,
    context: { projectName: projectDirName } satisfies RenderTemplateContext,
  });

  await installWorkflowDeps({
    packageManager,
    projectDir: targetDir,
    exampleName,
  });

  const spin = spinner();
  spin.start('Configuring Workflow Studio files');
  await writeFactories({
    targetDir,
    factories: example.placeholders,
    projectName: projectDirName,
  });
  await writeFactories({
    targetDir,
    factories: example.files,
    projectName: projectDirName,
  });
  await ensureWorkflowScript(targetDir);
  const worldSummary = await applyWorldConfig({
    selection: worldSelection,
    projectDir: targetDir,
    config: worldConfig,
  });
  if (worldSummary?.length) {
    log.message('');
    for (const line of worldSummary) {
      log.message(line);
    }
    log.message('');
  }
  if (example.codemods?.length) {
    await runCodemods({
      projectDir: targetDir,
      codemods: example.codemods,
    });
  }
  spin.stop('Project ready');

  const projectSuccessLabel = usingCurrentDirectory
    ? projectDirName
    : projectSpecifier;
  const nextSteps = [
    usingCurrentDirectory ? null : `cd ${projectSpecifier}`,
    PACKAGE_MANAGERS[packageManager].runScript('dev'),
    getWorkflowStudioCommand(packageManager),
  ].filter((step): step is string => Boolean(step));

  outro(
    `${pc.green('Success!')} Created ${pc.bold(
      projectSuccessLabel
    )} with template ${pc.yellow(
      template.label
    )} (${example.label}).\n\nNext steps:\n  ${nextSteps.join('\n  ')}`
  );
}
