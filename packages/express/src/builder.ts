import {
  BaseBuilder,
  createBaseBuilderConfig,
  type WorkflowConfig,
} from '@workflow/builders';
import {
  DEFAULT_OUTPUT_DIR,
  DEFAULT_WORKFLOW_DIRS,
  HANDLER_FILENAMES,
} from './constants.js';
import type { WorkflowOptions } from './types.js';

/**
 * Express-specific builder that generates ESM format workflow files.
 *
 * Follows the framework integration docs pattern:
 * 1. Extends BaseBuilder (recommended approach)
 * 2. Generates ESM format files for modern Node.js
 * 3. Creates manifest and client bundle for workflow metadata
 * 4. Outputs to .well-known/workflow/v1/ directory
 *
 * Usage:
 * ```bash
 * workflow build
 * ```
 */
export class ExpressBuilder extends BaseBuilder {
  constructor(options: WorkflowOptions = {}) {
    const workingDir = process.cwd();
    const resolvedDirs =
      options.dirs && options.dirs.length > 0
        ? Array.from(new Set(options.dirs))
        : [...DEFAULT_WORKFLOW_DIRS];

    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;

    const config: WorkflowConfig = {
      ...createBaseBuilderConfig({
        workingDir,
        dirs: resolvedDirs,
      }),
      buildTarget: 'standalone',
      stepsBundlePath: `${outputDir}/${HANDLER_FILENAMES.step}`,
      workflowsBundlePath: `${outputDir}/${HANDLER_FILENAMES.flow}`,
      webhookBundlePath: `${outputDir}/${HANDLER_FILENAMES.webhook}`,
      clientBundlePath: `${outputDir}/${HANDLER_FILENAMES.client}`,
    };

    super(config);
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();

    if (inputFiles.length === 0) {
      console.log('[workflow-express] No workflow files found');
      return;
    }

    console.log(
      `[workflow-express] Building ${inputFiles.length} workflow(s)...`
    );

    // Following framework integration docs: specify format: 'esm'
    await this.createStepsBundle({
      inputFiles,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
      outfile: this.config.stepsBundlePath,
      format: 'esm',
    });

    await this.createWorkflowsBundle({
      inputFiles,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
      outfile: this.config.workflowsBundlePath,
      format: 'esm',
    });

    await this.createWebhookBundle({
      outfile: this.config.webhookBundlePath,
    });

    await this.createClientLibrary();

    console.log('[workflow-express] Build completed successfully!');
    console.log('[workflow-express] Generated files:');
    console.log(`  - ${this.config.stepsBundlePath}`);
    console.log(`  - ${this.config.workflowsBundlePath}`);
    console.log(`  - ${this.config.webhookBundlePath}`);
    if (this.config.clientBundlePath) {
      console.log(`  - ${this.config.clientBundlePath}`);
    }
  }
}
