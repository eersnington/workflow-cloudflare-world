import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BaseBuilder, type WorkflowConfig } from '@workflow/builders';

export class FastifyBuilder extends BaseBuilder {
  constructor(config?: Partial<WorkflowConfig>) {
    const workingDir = config?.workingDir || process.cwd();

    super({
      ...config,
      dirs: config?.dirs || ['src/workflows', 'workflows'],
      workingDir,
      stepsBundlePath: '',
      workflowsBundlePath: '',
      webhookBundlePath: '',
      buildTarget: 'standalone',
    });
  }

  override async build(): Promise<void> {
    const workflowGeneratedDir = resolve(
      this.config.workingDir,
      '.well-known/workflow/v1'
    );

    await mkdir(workflowGeneratedDir, { recursive: true });

    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();

    const options = {
      inputFiles,
      format: 'esm' as const,
      tsBaseUrl: tsConfig.baseUrl,
      tsPaths: tsConfig.paths,
    };

    await this.createWorkflowsBundle({
      ...options,
      outfile: join(workflowGeneratedDir, 'flow.js'),
    });

    await this.createStepsBundle({
      ...options,
      outfile: join(workflowGeneratedDir, 'step.js'),
    });

    await this.createWebhookBundle({
      outfile: join(workflowGeneratedDir, 'webhook.js'),
    });

    const manifest = {
      version: 'v1',
      generatedAt: new Date().toISOString(),
      handlers: {
        flow: './flow.js',
        step: './step.js',
        webhook: './webhook.js',
      },
    };

    await writeFile(
      join(workflowGeneratedDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
  }
}
