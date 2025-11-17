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
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pc from 'picocolors';
import { z } from 'zod';
import { templates, type TemplateName } from '../templates.js';
import { writeTemplateFiles } from '../utils/files.js';

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
  },
  pnpm: {
    label: 'pnpm',
    description: 'Fast, disk-efficient package manager',
    nextFlag: '--use-pnpm',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `pnpm ${script}`,
  },
  yarn: {
    label: 'yarn',
    description: 'Classic yarn package manager',
    nextFlag: '--use-yarn',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `yarn ${script}`,
  },
  bun: {
    label: 'bun',
    description: 'Bun toolkit package manager',
    nextFlag: '--use-bun',
    installArgs: (deps: string[]) => ['add', ...deps],
    runScript: (script: string) => `bun run ${script}`,
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
const resolveCommand = (bin: string) => (isWindows ? `${bin}.cmd` : bin);

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

async function scaffoldWithFrameworkCli({
  template,
  projectName,
  packageManager,
  cwd,
}: {
  template: TemplateName;
  projectName: string;
  packageManager: PackageManagerName;
  cwd: string;
}) {
  if (template === 'nextjs') {
    const flags = [
      packageManager ? PACKAGE_MANAGERS[packageManager].nextFlag : '',
    ].filter(Boolean) as string[];
    const args = [
      'create-next-app@latest',
      projectName,
      '--typescript',
      '--tailwind',
      '--react-compiler',
      '--eslint',
      '--app',
      '--yes',
      ...flags,
    ];
    log.message(pc.blue(`\n> npx ${args.join(' ')}`));
    await runCommand('npx', args, { cwd });
    return;
  }

  if (template === 'sveltekit') {
    const args = [
      'sv',
      'create',
      projectName,
      '--template=minimal',
      '--types=ts',
      '--no-add-ons',
    ];
    log.message(pc.blue(`\n> npx ${args.join(' ')}`));
    await runCommand('npx', args, { cwd });
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

  const invocationDir = process.env.INIT_CWD
    ? resolve(process.env.INIT_CWD)
    : process.cwd();

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

  const ProjectNameSchema = z
    .string()
    .min(1, 'Project name cannot be empty')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Project name may only include letters, numbers, dashes, and underscores'
    );

  const projectName = ProjectNameSchema.parse(projectNameInput.trim());

  const targetDir = resolve(invocationDir, projectName);
  if (existsSync(targetDir)) {
    throw new Error(
      `Directory "${projectName}" already exists. Choose a different name or remove it.`
    );
  }

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
    projectName,
    packageManager,
    cwd: invocationDir,
  });

  await installWorkflowDeps({
    packageManager,
    projectDir: targetDir,
  });

  const spin = spinner();
  spin.start('Configuring Workflow Studio files');
  await writeTemplateFiles(
    targetDir,
    Object.fromEntries(
      Object.entries(example.files).map(([filePath, factory]) => [
        filePath,
        factory({ projectName }),
      ])
    )
  );
  await ensureWorkflowScript(targetDir);
  spin.stop('Project ready');

  outro(
    `${pc.green('Success!')} Created ${pc.bold(
      projectName
    )} with template ${pc.yellow(
      template.label
    )} (${example.label}).\n\nNext steps:\n  cd ${projectName}\n  ${PACKAGE_MANAGERS[
      packageManager
    ].runScript('dev')}\n  npx workflow-studio web`
  );
}
