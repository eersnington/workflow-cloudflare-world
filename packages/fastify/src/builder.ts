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
import type { WorkflowFastifyOptions } from './types.js';
import { watch } from 'node:fs';

/**
 * Fastify-specific builder that generates workflow files with HMR support.
 *
 * Follows Nitro's sophisticated build-system integration approach:
 * 1. Extends BaseBuilder with Fastify-specific optimizations
 * 2. Supports Hot Module Replacement for development
 * 3. Generates ES modules for modern Node.js/Fastify
 * 4. Smart directory discovery with deduplication
 * 5. Performance optimizations for Fastify ecosystem
 */
export class FastifyBuilder extends BaseBuilder {
  private hmrWatcher?: ReturnType<typeof watch>;
  private isDevelopment = process.env.NODE_ENV !== 'production';

  constructor(options: WorkflowFastifyOptions = {}) {
    const workingDir = process.cwd();
    const resolvedDirs =
      options.dirs && options.dirs.length > 0
        ? Array.from(new Set(options.dirs)) // Deduplicate directories
        : [...DEFAULT_WORKFLOW_DIRS];

    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;

    const config: WorkflowConfig = {
      ...createBaseBuilderConfig({
        workingDir,
        dirs: resolvedDirs,
      }),
      buildTarget: 'standalone', // Use standalone target for Fastify
      stepsBundlePath: `${outputDir}/${HANDLER_FILENAMES.step}`,
      workflowsBundlePath: `${outputDir}/${HANDLER_FILENAMES.flow}`,
      webhookBundlePath: `${outputDir}/${HANDLER_FILENAMES.webhook}`,
      clientBundlePath: `${outputDir}/${HANDLER_FILENAMES.client}`,
    };

    super(config);

    // Enable HMR automatically in development or if explicitly requested
    if (options.hmr || (this.isDevelopment && options.hmr !== false)) {
      this.enableHMR();
    }
  }

  /**
   * Enable Hot Module Replacement for workflow files
   */
  private enableHMR(): void {
    if (this.hmrWatcher) {
      return; // Already enabled
    }

    // Only attempt HMR if workflow directories exist
    const { accessSync } = require('fs');
    const existingDirs = this.config.dirs.filter((dir) => {
      try {
        accessSync(dir, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    });

    if (existingDirs.length === 0) {
      // No directories exist to watch, silently disable HMR
      return;
    }

    console.log('[workflow-fastify] Enabling HMR for workflow files...');

    try {
      // Watch all workflow directories for changes
      const watchPatterns = existingDirs.map(
        (dir) => `${dir}/**/*.{ts,js,tsx,jsx}`
      );

      this.hmrWatcher = watch(
        watchPatterns.join(' '),
        { recursive: true },
        (eventType: string, filename: string | null) => {
          if (eventType === 'change' && filename) {
            console.log(
              `[workflow-fastify] HMR: Workflow file changed: ${filename}`
            );
            this.rebuildWorkflow(filename);
          }
        }
      );
    } catch (error) {
      // Silently fail - HMR is nice-to-have but not required
      // Don't set hmrWatcher, HMR will be disabled
    }
  }

  /**
   * Rebuild specific workflow file when changed (HMR)
   */
  private async rebuildWorkflow(filename: string): Promise<void> {
    try {
      console.log(`[workflow-fastify] Rebuilding workflow: ${filename}`);
      await this.build();

      // Emit HMR event for Fastify development server
      if (typeof process.send === 'function') {
        process.send({ type: 'workflow:hmr', filename });
      }

      console.log(`[workflow-fastify] HMR rebuild completed: ${filename}`);
    } catch (error) {
      console.error(
        `[workflow-fastify] HMR rebuild failed: ${filename}`,
        error
      );
    }
  }

  /**
   * Disable HMR (useful for testing or production)
   */
  disableHMR(): void {
    if (this.hmrWatcher) {
      this.hmrWatcher.close();
      this.hmrWatcher = undefined;
      console.log('[workflow-fastify] HMR disabled');
    }
  }

  override async build(): Promise<void> {
    const inputFiles = await this.getInputFiles();
    const tsConfig = await this.getTsConfigOptions();

    if (inputFiles.length === 0) {
      console.log('[workflow-fastify] No workflow files found');
      return;
    }

    const buildType = this.isDevelopment ? 'development' : 'production';
    console.log(
      `[workflow-fastify] Building ${inputFiles.length} workflow(s) for ${buildType}...`
    );

    // Fastify-optimized bundle creation with ESM format
    try {
      await this.createStepsBundle({
        inputFiles,
        tsBaseUrl: tsConfig.baseUrl,
        tsPaths: tsConfig.paths,
        outfile: this.config.stepsBundlePath,
        format: 'esm',
        externalizeNonSteps: true,
      });

      await this.createWorkflowsBundle({
        inputFiles,
        tsBaseUrl: tsConfig.baseUrl,
        tsPaths: tsConfig.paths,
        outfile: this.config.workflowsBundlePath,
        format: 'esm',
        bundleFinalOutput: true,
      });

      await this.createWebhookBundle({
        outfile: this.config.webhookBundlePath,
      });

      await this.createClientLibrary();

      console.log('[workflow-fastify] Build completed successfully!');
      console.log('[workflow-fastify] Generated files:');
      console.log(`  - ${this.config.stepsBundlePath}`);
      console.log(`  - ${this.config.workflowsBundlePath}`);
      console.log(`  - ${this.config.webhookBundlePath}`);
      if (this.config.clientBundlePath) {
        console.log(`  - ${this.config.clientBundlePath}`);
      }

      console.log(
        `[workflow-fastify] Build completed at: ${new Date().toISOString()}`
      );
    } catch (error) {
      console.error('[workflow-fastify] Build failed:', error);
      throw error;
    }
  }

  /**
   * Get build statistics for monitoring and debugging
   */
  getBuildStats(): {
    handlerCount: number;
    outputFiles: string[];
    hmrEnabled: boolean;
    buildTarget: string;
    isDevelopment: boolean;
  } {
    return {
      handlerCount: this.config.dirs.length,
      outputFiles: [
        this.config.stepsBundlePath!,
        this.config.workflowsBundlePath!,
        this.config.webhookBundlePath!,
        this.config.clientBundlePath!,
      ].filter(Boolean),
      hmrEnabled: !!this.hmrWatcher,
      buildTarget: this.config.buildTarget,
      isDevelopment: this.isDevelopment,
    };
  }

  /**
   * Cleanup resources (important for graceful shutdown)
   */
  async cleanup(): Promise<void> {
    this.disableHMR();
    console.log('[workflow-fastify] Builder cleanup completed');
  }
}
