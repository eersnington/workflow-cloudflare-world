import { execa } from 'execa';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

type InitOptions = {
  template: string;
  example: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
};

const CLI_PATH = new URL('../dist/index.js', import.meta.url).pathname;

async function runInit({ template, example, packageManager }: InitOptions) {
  const cwd = await mkdtemp(join(tmpdir(), 'workflow-init-'));
  const env = {
    ...process.env,
    WORKFLOW_STUDIO_SKIP_INSTALL: '1',
  };
  const args = [
    CLI_PATH,
    'init',
    '--yes',
    `--template`,
    template,
    `--example`,
    example,
    '--package-manager',
    packageManager,
    'demo-app',
  ];
  await execa('node', args, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  return join(cwd, 'demo-app');
}

async function fileExists(cwd: string, relative: string) {
  try {
    await stat(join(cwd, relative));
    return true;
  } catch {
    return false;
  }
}

async function loadJson(cwd: string, relative: string) {
  const contents = await readFile(join(cwd, relative), 'utf8');
  return JSON.parse(contents) as Record<string, unknown>;
}

describe('init e2e (install skipped)', () => {
  const cases: InitOptions[] = [
    { template: 'nextjs', example: 'minimal', packageManager: 'pnpm' },
    { template: 'nextjs', example: 'ai', packageManager: 'pnpm' },
    { template: 'sveltekit', example: 'minimal', packageManager: 'pnpm' },
    { template: 'sveltekit', example: 'ai', packageManager: 'pnpm' },
    { template: 'nitro', example: 'minimal', packageManager: 'pnpm' },
    { template: 'nitro', example: 'ai', packageManager: 'pnpm' },
    { template: 'hono', example: 'minimal', packageManager: 'pnpm' },
    { template: 'hono', example: 'ai', packageManager: 'pnpm' },
    { template: 'nuxt', example: 'minimal', packageManager: 'pnpm' },
    { template: 'nuxt', example: 'ai', packageManager: 'pnpm' },
    { template: 'express', example: 'minimal', packageManager: 'pnpm' },
    { template: 'express', example: 'ai', packageManager: 'pnpm' },
    { template: 'vite', example: 'minimal', packageManager: 'pnpm' },
    { template: 'vite', example: 'ai', packageManager: 'pnpm' },
  ];

  test.each(cases)(
    'scaffolds %s %s',
    { timeout: 120_000 },
    async ({ template, example, packageManager }) => {
      const cwd = await runInit({ template, example, packageManager });
      // package.json exists and has workflow dep entry (skip version check due to install skip)
      const pkg = await loadJson(cwd, 'package.json');
      expect(pkg).toHaveProperty('name');
      // ensure placeholders are not present in scaffolded files where codemods run
      const placeholderHit = await execa('rg', ['__WORKFLOW_', '.'], {
        cwd,
        reject: false,
      });
      expect(placeholderHit.exitCode).not.toBe(0);

      // Basic existence checks per template
      if (template === 'nextjs') {
        expect(await fileExists(cwd, 'app/api')).toBe(true);
        if (example === 'ai') {
          const page = await readFile(join(cwd, 'app/page.tsx'), 'utf8');
          expect(page).toContain('AI Workflow Patterns');
          const route = await readFile(
            join(cwd, 'app/api/workflows/route.ts'),
            'utf8'
          );
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
      if (template === 'sveltekit') {
        expect(await fileExists(cwd, 'src/routes')).toBe(true);
        if (example === 'ai') {
          const page = await readFile(
            join(cwd, 'src/routes/+page.svelte'),
            'utf8'
          );
          expect(page).toContain('AI Workflow Patterns');
          const route = await readFile(
            join(cwd, 'src/routes/api/workflows/+server.ts'),
            'utf8'
          );
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
      if (template === 'nitro') {
        expect(await fileExists(cwd, 'server')).toBe(true);
        if (example === 'ai') {
          const page = await readFile(join(cwd, 'index.html'), 'utf8');
          expect(page).toContain('AI Workflow Patterns');
          const route = await readFile(
            join(cwd, 'server/api/workflows.post.ts'),
            'utf8'
          );
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
      if (template === 'hono' || template === 'express') {
        expect(await fileExists(cwd, 'workflows')).toBe(true);
        expect(await fileExists(cwd, 'src/index.ts')).toBe(true);
        if (example === 'ai') {
          const route = await readFile(join(cwd, 'src/index.ts'), 'utf8');
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
      if (template === 'nuxt') {
        expect(await fileExists(cwd, 'server/api')).toBe(true);
        if (example === 'ai') {
          const page = await readFile(join(cwd, 'app/app.vue'), 'utf8');
          expect(page).toContain('AI Workflow Patterns');
          const route = await readFile(
            join(cwd, 'server/api/workflows.post.ts'),
            'utf8'
          );
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
      if (template === 'vite') {
        expect(await fileExists(cwd, 'api')).toBe(true);
        if (example === 'ai') {
          const page = await readFile(join(cwd, 'src/App.tsx'), 'utf8');
          expect(page).toContain('AI Workflow Patterns');
          const route = await readFile(
            join(cwd, 'api/workflows.post.ts'),
            'utf8'
          );
          expect(route).toContain('sequentialWorkflow');
          expect(route).toContain('orchestratorWorkflow');
        }
      }
    }
  );
});
