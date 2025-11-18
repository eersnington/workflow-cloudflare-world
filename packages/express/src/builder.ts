import { BaseBuilder } from '@workflow/builders';
import type { WorkflowOptions } from './index.js';

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
    const workflowsDir = options.workflowsDir ?? 'workflows';
    const workingDir = process.cwd();

    super({
      buildTarget: 'standalone',
      dirs: [workflowsDir],
      workingDir,
      stepsBundlePath: '.well-known/workflow/v1/step.js',
      workflowsBundlePath: '.well-known/workflow/v1/flow.js',
      webhookBundlePath: '.well-known/workflow/v1/webhook.js',
      clientBundlePath: '.well-known/workflow/v1/client.js',
    });
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
      outfile: '.well-known/workflow/v1/step.js',
      format: 'esm',
    });

    await this.createWorkflowsBundle({
      inputFiles,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
      outfile: '.well-known/workflow/v1/flow.js',
      format: 'esm',
    });

    await this.createWebhookBundle({
      outfile: '.well-known/workflow/v1/webhook.js',
    });

    await this.createClientLibrary();

    console.log('[workflow-express] Build completed successfully!');
    console.log('[workflow-express] Generated files:');
    console.log('  - .well-known/workflow/v1/step.js');
    console.log('  - .well-known/workflow/v1/flow.js');
    console.log('  - .well-known/workflow/v1/webhook.js');
    console.log('  - .well-known/workflow/v1/client.js');
    console.log('  - .well-known/workflow/manifest.json');
  }
}
