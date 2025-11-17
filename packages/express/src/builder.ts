import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BaseBuilder,
  VercelBuildOutputAPIBuilder,
  createBaseBuilderConfig,
  type WorkflowConfig,
} from '@workflow/builders';
import { HANDLER_FILENAMES } from './constants.js';

const DEFAULT_WORKFLOW_DIRS = [
  'workflows',
  'src/workflows',
  'app',
  'src/app',
  'routes',
  'src/routes',
  'api',
  'src/api',
];

export type WorkflowExpressBuilderTarget = 'local' | 'vercel';

export interface WorkflowExpressBuilderOptions {
  workingDir?: string;
  watch?: boolean;
  dirs?: string[];
  outDir?: string;
  workflowManifestPath?: WorkflowConfig['workflowManifestPath'];
  externalPackages?: string[];
  target?: WorkflowExpressBuilderTarget | 'auto';
}

export class WorkflowExpressLocalBuilder extends BaseBuilder {
  #outDir: string;

  constructor(options: WorkflowExpressBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const resolvedOutDir = options.outDir
      ? resolve(workingDir, options.outDir)
      : join(workingDir, '.well-known/workflow/v1');
    const defaultManifestPath = join(
      '.well-known',
      'workflow',
      'manifest.json'
    );
    const manifestPath = options.workflowManifestPath ?? defaultManifestPath;

    super({
      ...createBaseBuilderConfig({
        workingDir,
        watch: options.watch,
        dirs: resolveWorkflowDirs(options.dirs),
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: manifestPath,
      buildTarget: 'standalone',
    });

    this.#outDir = resolvedOutDir;
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();
    await mkdir(this.#outDir, { recursive: true });

    await this.createWorkflowsBundle({
      inputFiles,
      outfile: join(this.#outDir, `${HANDLER_FILENAMES.flow}.mjs`),
      format: 'esm',
      bundleFinalOutput: false,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    });

    await this.createStepsBundle({
      inputFiles,
      outfile: join(this.#outDir, `${HANDLER_FILENAMES.step}.mjs`),
      externalizeNonSteps: true,
      format: 'esm',
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    });

    await this.createWebhookBundle({
      outfile: join(this.#outDir, `${HANDLER_FILENAMES.webhook}.mjs`),
      bundle: false,
    });
  }
}

export class WorkflowExpressVercelBuilder extends VercelBuildOutputAPIBuilder {
  constructor(options: WorkflowExpressBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const manifestPath =
      options.workflowManifestPath ?? '.well-known/workflow/manifest.json';

    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: resolveWorkflowDirs(options.dirs),
        watch: false,
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: manifestPath,
      buildTarget: 'vercel-build-output-api',
    });
  }
}

export function createWorkflowExpressBuilder(
  options: WorkflowExpressBuilderOptions = {}
): BaseBuilder {
  const target = resolveBuildTarget(options.target);
  if (target === 'vercel') {
    return new WorkflowExpressVercelBuilder(options);
  }
  return new WorkflowExpressLocalBuilder(options);
}

function resolveWorkflowDirs(customDirs?: string[]): string[] {
  const dirs =
    customDirs && customDirs.length > 0 ? customDirs : DEFAULT_WORKFLOW_DIRS;
  return Array.from(new Set(dirs));
}

function resolveBuildTarget(
  target: WorkflowExpressBuilderOptions['target']
): WorkflowExpressBuilderTarget {
  if (target && target !== 'auto') {
    return target;
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL_DEPLOYMENT_ID) {
    return 'vercel';
  }
  return 'local';
}
