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
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import pc from 'picocolors';
import { getCodemodDefinition, type CodemodId } from '../codemods.js';
import {
  templates,
  type TemplateContext,
  type TemplateName,
} from '../templates.js';
import { writeTemplateFiles } from '../utils/files.js';
import { runAstGrep } from '../utils/ast-grep.js';
import {
  ensureProjectDirectoryReady,
  normalizeProjectName,
} from '../utils/project.js';

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

const ensureNotCancelled = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Operation cancelled.');
    process.exit(1);
  }
  return value;
};

const resolveTemplateSelection = async (
  templateFlag: string | undefined,
  yes: boolean
): Promise<TemplateName> => {
  const templateEntries = Object.entries(templates).map(([value, meta]) => ({
    value,
    label: `${meta.label} — ${meta.description}`,
  }));

  if (templateFlag) {
    if (!templates[templateFlag]) {
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

  if (yes) {
    return DEFAULT_PACKAGE_MANAGER as PackageManagerName;
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

async function runCommand(
  command: string,
  args: string[],
  {
    cwd,
  }: {
    cwd: string;
  }
) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(resolveCommand(command), args, {
      cwd,
      stdio: 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(`Command "${command} ${args.join(' ')}" exited with ${code}`)
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
    const { rule, globs } = getCodemodDefinition(codemodId);
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
        rule,
        globs,
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

async function runWithPackageManagerExecutor({
  packageManager,
  cli,
  cliArgs,
  cwd,
}: {
  packageManager: PackageManagerName;
  cli: string;
  cliArgs: string[];
  cwd: string;
}) {
  const executor = PACKAGE_MANAGERS[packageManager].createExecutor;
  const args = [...executor.args, cli, ...cliArgs];
  log.message(pc.blue(`\n> ${executor.command} ${args.join(' ')}`));
  await runCommand(executor.command, args, { cwd });
}

async function scaffoldWithFrameworkCli({
  template,
  projectSpecifier,
  packageManager,
  cwd,
}: {
  template: TemplateName;
  projectSpecifier: string;
  packageManager: PackageManagerName;
  cwd: string;
}) {
  if (template === 'nextjs') {
    const flags = [
      packageManager ? PACKAGE_MANAGERS[packageManager].nextFlag : '',
    ].filter(Boolean) as string[];
    const cliArgs = [
      projectSpecifier,
      '--typescript',
      '--tailwind',
      '--react-compiler',
      '--eslint',
      '--app',
      '--yes',
      ...flags,
    ];
    await runWithPackageManagerExecutor({
      packageManager,
      cli: 'create-next-app@latest',
      cliArgs,
      cwd,
    });
    return;
  }

  if (template === 'sveltekit') {
    const cliArgs = [
      'create',
      projectSpecifier,
      '--template=minimal',
      '--types=ts',
      '--no-add-ons',
    ];
    await runWithPackageManagerExecutor({
      packageManager,
      cli: 'sv',
      cliArgs,
      cwd,
    });
    return;
  }

  throw new Error(`Unsupported template "${template}"`);
}

async function installWorkflowDeps({
  packageManager,
  projectDir,
}: {
  packageManager: PackageManagerName;
  projectDir: string;
}) {
  const deps = ['@workflow/cli@latest', '@workflow/core@latest'];
  const args = PACKAGE_MANAGERS[packageManager].installArgs(deps);
  log.message(
    pc.blue(`\n> ${packageManager} ${args.join(' ')} (${projectDir})`)
  );
  await runCommand(packageManager, args, { cwd: projectDir });
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

export async function runInitCommand(options: InitOptions) {
  intro(pc.cyan('Workflow Studio'));

  const invocationDir =
    (process.env.INIT_CWD && resolve(process.env.INIT_CWD)) ??
    (process.env.PWD && resolve(process.env.PWD)) ??
    process.cwd();

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

  const templateName = await resolveTemplateSelection(
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

  await scaffoldWithFrameworkCli({
    template: templateName,
    projectSpecifier,
    packageManager,
    cwd: invocationDir,
  });

  await installWorkflowDeps({
    packageManager,
    projectDir: targetDir,
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
  if (example.codemods?.length) {
    await runCodemods({
      projectDir: targetDir,
      codemods: example.codemods,
    });
  }
  await ensureWorkflowScript(targetDir);
  spin.stop('Project ready');

  const projectSuccessLabel = usingCurrentDirectory
    ? projectDirName
    : projectSpecifier;
  const nextSteps = [
    usingCurrentDirectory ? null : `cd ${projectSpecifier}`,
    PACKAGE_MANAGERS[packageManager].runScript('dev'),
    'npx workflow-studio web',
  ].filter((step): step is string => Boolean(step));

  outro(
    `${pc.green('Success!')} Created ${pc.bold(
      projectSuccessLabel
    )} with template ${pc.yellow(
      template.label
    )} (${example.label}).\n\nNext steps:\n  ${nextSteps.join('\n  ')}`
  );
}
