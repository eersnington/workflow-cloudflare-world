import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BaseBuilder,
  createBaseBuilderConfig,
  VercelBuildOutputAPIBuilder,
  type WorkflowConfig,
} from '@workflow/builders';
import {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_WORKFLOW_DIRS,
  HANDLER_FILENAMES,
} from './constants.js';

export type WorkflowNodeBuilderTarget = 'local' | 'vercel';

export interface WorkflowNodeBuilderOptions {
  workingDir?: string;
  watch?: boolean;
  dirs?: string[];
  outDir?: string;
  /**
   * Alias for outDir. Prefer this going forward for consistency with other adapters.
   */
  outputDir?: string;
  workflowManifestPath?: WorkflowConfig['workflowManifestPath'];
  externalPackages?: string[];
  target?: WorkflowNodeBuilderTarget | 'auto';
}

export class WorkflowNodeLocalBuilder extends BaseBuilder {
  #outputDir: string;

  constructor(options: WorkflowNodeBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const resolvedDirs = resolveWorkflowDirs(options.dirs);
    const resolvedOutputDir = resolveOutputDir(
      workingDir,
      options.outputDir ?? options.outDir
    );

    super({
      ...createBaseBuilderConfig({
        workingDir,
        watch: options.watch,
        dirs: resolvedDirs,
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: options.workflowManifestPath,
      buildTarget: 'standalone',
      stepsBundlePath: join(resolvedOutputDir, `${HANDLER_FILENAMES.step}.js`),
      workflowsBundlePath: join(
        resolvedOutputDir,
        `${HANDLER_FILENAMES.flow}.js`
      ),
      webhookBundlePath: join(
        resolvedOutputDir,
        `${HANDLER_FILENAMES.webhook}.js`
      ),
      clientBundlePath: join(
        resolvedOutputDir,
        `${HANDLER_FILENAMES.client}.js`
      ),
    });

    this.#outputDir = resolvedOutputDir;
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    if (inputFiles.length === 0) {
      console.log('[workflow-node] No workflow files found');
      return;
    }

    const tsConfig = await this.getTsConfigOptions();
    await mkdir(this.#outputDir, { recursive: true });

    await this.createWorkflowsBundle({
      inputFiles,
      outfile: this.config.workflowsBundlePath,
      format: 'esm',
      bundleFinalOutput: false,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    });

    await this.createStepsBundle({
      inputFiles,
      outfile: this.config.stepsBundlePath,
      externalizeNonSteps: true,
      format: 'esm',
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    });

    await this.createWebhookBundle({
      outfile: this.config.webhookBundlePath,
      bundle: false,
    });

    await this.createClientLibrary();

    console.log('[workflow-node] Build completed successfully!');
    console.log('[workflow-node] Generated files:');
    console.log(`  - ${this.config.stepsBundlePath}`);
    console.log(`  - ${this.config.workflowsBundlePath}`);
    console.log(`  - ${this.config.webhookBundlePath}`);
    if (this.config.clientBundlePath) {
      console.log(`  - ${this.config.clientBundlePath}`);
    }
  }
}

export class WorkflowNodeVercelBuilder extends VercelBuildOutputAPIBuilder {
  constructor(options: WorkflowNodeBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const resolvedOutputDir = resolveOutputDir(
      workingDir,
      options.outputDir ?? options.outDir
    );

    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs: resolveWorkflowDirs(options.dirs),
        watch: false,
        externalPackages: options.externalPackages,
      }),
      workflowManifestPath: options.workflowManifestPath,
      buildTarget: 'vercel-build-output-api',
      clientBundlePath: join(
        resolvedOutputDir,
        `${HANDLER_FILENAMES.client}.js`
      ),
    });
  }
}

export function createWorkflowNodeBuilder(
  options: WorkflowNodeBuilderOptions = {}
): BaseBuilder {
  const target = resolveBuildTarget(options.target);
  if (target === 'vercel') {
    return new WorkflowNodeVercelBuilder({
      ...options,
      outDir: undefined,
      target: 'vercel',
    });
  }
  return new WorkflowNodeLocalBuilder({
    ...options,
    target: 'local',
  });
}

function resolveWorkflowDirs(customDirs?: string[]): string[] {
  const dirs =
    customDirs && customDirs.length > 0 ? customDirs : DEFAULT_WORKFLOW_DIRS;
  return Array.from(new Set(dirs));
}

function resolveOutputDir(workingDir: string, customDir?: string): string {
  if (customDir) {
    return resolve(workingDir, customDir);
  }
  return resolve(workingDir, DEFAULT_OUTPUT_DIR);
}

function resolveBuildTarget(
  target: WorkflowNodeBuilderOptions['target']
): WorkflowNodeBuilderTarget {
  if (target && target !== 'auto') {
    return target;
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL_DEPLOYMENT_ID) {
    return 'vercel';
  }
  return 'local';
}
