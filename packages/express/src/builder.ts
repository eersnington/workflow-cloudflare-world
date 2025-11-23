import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BaseBuilder, createBaseBuilderConfig } from '@workflow/builders';

export const DEFAULT_WORKFLOW_DIRS = ['workflows', 'src/workflows'];
export const DEFAULT_OUTPUT_DIR = '.well-known/workflow/v1';
const BUNDLE_FORMAT = 'cjs' as const;
export const HANDLER_FILENAMES = {
  flow: 'flow.js',
  step: 'step.js',
  webhook: 'webhook.js',
} as const;

export type ExpressBuilderOptions = {
  dirs?: string[];
  outputDir?: string;
  workingDir?: string;
  watch?: boolean;
  workflowManifestPath?: string;
};

export class ExpressBuilder extends BaseBuilder {
  #outputDir: string;
  #workingDir: string;
  #dirs: string[];

  constructor(options: ExpressBuilderOptions = {}) {
    const workingDir = options.workingDir ?? process.cwd();
    const dirs =
      options.dirs && options.dirs.length > 0
        ? Array.from(new Set(options.dirs))
        : [...DEFAULT_WORKFLOW_DIRS];
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const absoluteOutputDir = resolve(workingDir, outputDir);

    const stepsBundlePath = join(absoluteOutputDir, HANDLER_FILENAMES.step);
    const workflowsBundlePath = join(absoluteOutputDir, HANDLER_FILENAMES.flow);
    const webhookBundlePath = join(
      absoluteOutputDir,
      HANDLER_FILENAMES.webhook
    );

    super({
      ...createBaseBuilderConfig({
        workingDir,
        dirs,
        watch: options.watch,
      }),
      buildTarget: 'standalone',
      stepsBundlePath,
      workflowsBundlePath,
      webhookBundlePath,
      workflowManifestPath: options.workflowManifestPath,
    });

    this.#outputDir = absoluteOutputDir;
    this.#workingDir = workingDir;
    this.#dirs = dirs;
  }

  get bundlePaths() {
    return {
      flow: this.config.workflowsBundlePath,
      step: this.config.stepsBundlePath,
      webhook: this.config.webhookBundlePath,
    };
  }

  get watchDirectories(): string[] {
    return this.#dirs.map((dir) => resolve(this.#workingDir, dir));
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();

    await mkdir(this.#outputDir, { recursive: true });

    if (inputFiles.length === 0) {
      console.warn('[workflow-express] No workflow files found to build');
      return;
    }

    await this.createStepsBundle({
      inputFiles,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
      outfile: this.config.stepsBundlePath,
      format: BUNDLE_FORMAT,
      externalizeNonSteps: true,
    });

    await this.createWorkflowsBundle({
      inputFiles,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
      outfile: this.config.workflowsBundlePath,
      format: BUNDLE_FORMAT,
      bundleFinalOutput: true,
    });

    await this.createWebhookBundle({
      outfile: this.config.webhookBundlePath,
      bundle: true,
    });
  }
}
