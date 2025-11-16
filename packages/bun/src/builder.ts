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

export type WorkflowBunBuilderTarget = 'local' | 'vercel';

export interface WorkflowBunBuilderOptions {
  workingDir?: string;
  watch?: boolean;
  dirs?: string[];
  outDir?: string;
  workflowManifestPath?: WorkflowConfig['workflowManifestPath'];
  externalPackages?: string[];
  target?: WorkflowBunBuilderTarget | 'auto';
}

export class WorkflowBunLocalBuilder extends BaseBuilder {
  #outDir: string;

  constructor(options: WorkflowBunBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const resolvedOutDir = options.outDir
      ? resolve(workingDir, options.outDir)
      : join(workingDir, '.well-known/workflow/v1');

    super({
      ...createBaseBuilderConfig({
        workingDir,
        watch: options.watch,
        dirs: resolveWorkflowDirs(options.dirs),
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: options.workflowManifestPath,
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

export class WorkflowBunVercelBuilder extends VercelBuildOutputAPIBuilder {
  constructor(options: WorkflowBunBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();

    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: resolveWorkflowDirs(options.dirs),
        watch: false,
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: options.workflowManifestPath,
      buildTarget: 'vercel-build-output-api',
    });
  }
}

export function createWorkflowBunBuilder(
  options: WorkflowBunBuilderOptions = {}
): BaseBuilder {
  const target = resolveBuildTarget(options.target);
  if (target === 'vercel') {
    return new WorkflowBunVercelBuilder(options);
  }
  return new WorkflowBunLocalBuilder(options);
}

function resolveWorkflowDirs(customDirs?: string[]): string[] {
  const dirs =
    customDirs && customDirs.length > 0 ? customDirs : DEFAULT_WORKFLOW_DIRS;
  return Array.from(new Set(dirs));
}

function resolveBuildTarget(
  target: WorkflowBunBuilderOptions['target']
): WorkflowBunBuilderTarget {
  if (target && target !== 'auto') {
    return target;
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL_DEPLOYMENT_ID) {
    return 'vercel';
  }
  return 'local';
}
