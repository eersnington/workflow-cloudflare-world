import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BaseBuilder,
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

export interface WorkflowCloudflareBuilderOptions {
  workingDir?: string;
  watch?: boolean;
  dirs?: string[];
  outDir?: string;
  workflowManifestPath?: WorkflowConfig['workflowManifestPath'];
  externalPackages?: string[];
}

export class WorkflowCloudflareBuilder extends BaseBuilder {
  #outDir: string;

  constructor(options: WorkflowCloudflareBuilderOptions = {}) {
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

export function createWorkflowCloudflareBuilder(
  options: WorkflowCloudflareBuilderOptions = {}
): WorkflowCloudflareBuilder {
  return new WorkflowCloudflareBuilder(options);
}

function resolveWorkflowDirs(customDirs?: string[]): string[] {
  const dirs =
    customDirs && customDirs.length > 0 ? customDirs : DEFAULT_WORKFLOW_DIRS;
  return Array.from(new Set(dirs));
}
