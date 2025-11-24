import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, test } from 'vitest';
import { readFile, stat } from 'node:fs/promises';

const CLI_PATH = new URL('../dist/index.js', import.meta.url).pathname;
const RUN_INSTALL = process.env.WORKFLOW_STUDIO_E2E_INSTALL === '1';

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

async function runInitWithInstall() {
  const cwd = await mkdtemp(join(tmpdir(), 'workflow-init-install-'));
  const args = [
    CLI_PATH,
    'init',
    '--yes',
    '--template',
    'nextjs',
    '--example',
    'minimal',
    '--package-manager',
    'pnpm',
    'demo-install',
  ];
  await execa('node', args, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return join(cwd, 'demo-install');
}

const describeMaybe = RUN_INSTALL ? describe : describe.skip;

describeMaybe('init install e2e (real install)', () => {
  test(
    'installs deps and scaffolds project',
    { timeout: 180_000 },
    async () => {
      const cwd = await runInitWithInstall();
      const pkg = await loadJson(cwd, 'package.json');
      expect(pkg).toHaveProperty('dependencies');
      expect(JSON.stringify(pkg.dependencies)).toContain('workflow');
      expect(await fileExists(cwd, 'node_modules')).toBe(true);
      // Ensure placeholders are gone
      const placeholderHit = await execa('rg', ['__WORKFLOW_', '.'], {
        cwd,
        reject: false,
      });
      expect(placeholderHit.exitCode).not.toBe(0);
      // Basic file presence
      expect(await fileExists(cwd, 'app/api/signup/route.ts')).toBe(true);
      expect(await fileExists(cwd, 'workflows/user-signup.ts')).toBe(true);
    }
  );
});
