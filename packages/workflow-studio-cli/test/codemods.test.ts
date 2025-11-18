import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';

type RunAstGrep = typeof import('../src/utils/ast-grep.ts').runAstGrep;

const { runAstGrep } = (await import(
  new URL('../dist/utils/ast-grep.js', import.meta.url).href
)) as { runAstGrep: RunAstGrep };

type RunAstGrepArgs = Parameters<RunAstGrep>[0];
type CodemodId = RunAstGrepArgs['codemodId'];

type FileMap = Record<string, string>;

async function runCodemod(codemodId: CodemodId, files: FileMap) {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-codemod-'));
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const location = join(dir, relativePath);
      await mkdir(dirname(location), { recursive: true });
      await writeFile(location, contents, 'utf8');
    })
  );

  await runAstGrep({
    codemodId,
    cwd: dir,
  });

  const outputs: FileMap = {};
  for (const relativePath of Object.keys(files)) {
    outputs[relativePath] = await readFile(join(dir, relativePath), 'utf8');
  }
  return outputs;
}

function containsExpectedContent(
  content: string,
  expectedPatterns: string[]
): boolean {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  return expectedPatterns.every((pattern) =>
    normalizedContent.includes(pattern.replace(/\s+/g, ' '))
  );
}

const nextDefaultPage = `import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the page.tsx file.
          </h1>
        </div>
      </main>
    </div>
  );
}
`;

const svelteDefaultPage = `<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
`;

const nextMinimalPlaceholder =
  "export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_MINIMAL__';\n";
const nextAIPlaceholder =
  "export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NEXT_AI__';\n";
const svelteMinimalPlaceholder =
  "export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_MINIMAL__';\n";
const svelteCronPlaceholder =
  "export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SVELTE_CRON__';\n";
const honoPlaceholder =
  "export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_HONO_MINIMAL__';\n";

const honoDefaultIndex = `import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Hello Hono!'));

export default app;
`;

const honoTsconfig = `{
  "compilerOptions": {
    "target": "es2022"
  }
}
`;

const honoPackageJson = `{
  "name": "hono-app",
  "scripts": {
    "dev": "tsx watch src/index.ts"
  }
}
`;

test('next minimal page codemod transforms default page content', async () => {
  const output = await runCodemod('next/minimal/page', {
    'app/page.tsx': nextDefaultPage,
  });

  expect(
    containsExpectedContent(output['app/page.tsx'], [
      'export default function Page()',
      'Workflow Studio',
      'Create your first workflow',
      'workflow-studio start example',
    ])
  ).toBe(true);

  expect(output['app/page.tsx']).not.toContain(
    'import Image from "next/image"'
  );
  expect(output['app/page.tsx']).not.toContain(
    'export default function Home()'
  );
});

test('next minimal workflow codemod replaces placeholder with orchestrator workflow', async () => {
  const output = await runCodemod('next/minimal/workflow', {
    'workflows/user-signup.ts': nextMinimalPlaceholder,
  });

  expect(
    containsExpectedContent(output['workflows/user-signup.ts'], [
      'export async function handleUserSignup(email: string)',
      '"use workflow";',
      'await sleep',
      '"use step";',
      'throw new FatalError',
    ])
  ).toBe(true);

  expect(output['workflows/user-signup.ts']).not.toContain(
    '__WORKFLOW_NEXT_MINIMAL__'
  );
});

test('next ai page codemod transforms default page content', async () => {
  const output = await runCodemod('next/ai/page', {
    'app/page.tsx': nextDefaultPage,
  });

  expect(
    containsExpectedContent(output['app/page.tsx'], [
      "import { Suspense } from 'react';",
      'AI Orchestrator',
      'Reason through each step',
      'loadPlan',
      'Output recorded as <code>task-{item}</code>',
    ])
  ).toBe(true);
});

test('next ai workflow codemod populates analytics workflow', async () => {
  const output = await runCodemod('next/ai/workflow', {
    'workflows/user-signup.ts': nextAIPlaceholder,
  });

  expect(
    containsExpectedContent(output['workflows/user-signup.ts'], [
      "name: 'example-ai'",
      "const plan = await step('plan'",
      "return ['collect data', 'analyze', 'summarize']",
      'for (const task of plan)',
      'return results',
    ])
  ).toBe(true);

  expect(output['workflows/user-signup.ts']).not.toContain(
    '__WORKFLOW_NEXT_AI__'
  );
});

test('svelte minimal page codemod transforms default route', async () => {
  const output = await runCodemod('svelte/minimal/page', {
    'src/routes/+page.svelte': svelteDefaultPage,
  });

  expect(
    containsExpectedContent(output['src/routes/+page.svelte'], [
      '<script lang="ts">',
      'export let data',
      'Workflow Studio',
      'data.message',
      'workflow-studio start example',
    ])
  ).toBe(true);

  expect(output['src/routes/+page.svelte']).not.toContain(
    'Welcome to SvelteKit'
  );
});

test('svelte minimal workflow codemod populates workflow', async () => {
  const output = await runCodemod('svelte/minimal/workflow', {
    'workflows/user-signup.ts': svelteMinimalPlaceholder,
  });

  expect(
    containsExpectedContent(output['workflows/user-signup.ts'], [
      "import { sleep } from 'workflow';",
      "import { FatalError } from 'workflow';",
      'export async function handleUserSignup(email: string)',
      '"use workflow";',
      'await sleep',
      '"use step";',
      "throw new FatalError('Invalid Email')",
    ])
  ).toBe(true);

  expect(output['workflows/user-signup.ts']).not.toContain(
    '__WORKFLOW_SVELTE_MINIMAL__'
  );
});

test('svelte cron page codemod transforms default route', async () => {
  const output = await runCodemod('svelte/cron/page', {
    'src/routes/+page.svelte': svelteDefaultPage,
  });

  expect(
    containsExpectedContent(output['src/routes/+page.svelte'], [
      '<script lang="ts">',
      'export let data = { ticks: [] }',
      'Workflow Scheduler',
      'Cron-style workflow executions',
      'data.ticks',
      '{#each data.ticks as tick, index}',
    ])
  ).toBe(true);
});

test('svelte cron workflow codemod populates workflow', async () => {
  const output = await runCodemod('svelte/cron/workflow', {
    'workflows/example.ts': svelteCronPlaceholder,
  });

  expect(
    containsExpectedContent(output['workflows/example.ts'], [
      "name: 'example-cron'",
      "return await step('tick'",
      'return new Date().toISOString()',
    ])
  ).toBe(true);

  expect(output['workflows/example.ts']).not.toContain(
    '__WORKFLOW_SVELTE_CRON__'
  );
});

test('hono route codemod transforms default handler', async () => {
  const output = await runCodemod('hono/index/route', {
    'src/index.ts': honoDefaultIndex,
  });

  expect(
    containsExpectedContent(output['src/index.ts'], [
      "import { start } from 'workflow/api';",
      "import { handleUserSignup } from '../workflows/user-signup.js';",
      "app.post('/api/signup'",
    ])
  ).toBe(true);
});

test('hono workflow codemod populates workflow', async () => {
  const output = await runCodemod('hono/workflow', {
    'workflows/user-signup.ts': honoPlaceholder,
  });

  expect(
    containsExpectedContent(output['workflows/user-signup.ts'], [
      "import { FatalError, sleep } from 'workflow';",
      'export async function handleUserSignup(email: string)',
      '"use workflow";',
      'await sleep',
      '"use step";',
      "throw new FatalError('Invalid Email')",
    ])
  ).toBe(true);

  expect(output['workflows/user-signup.ts']).not.toContain(
    '__WORKFLOW_HONO_MINIMAL__'
  );
});

test('hono tsconfig codemod adds workflow plugin', async () => {
  const output = await runCodemod('hono/tsconfig/plugin', {
    'tsconfig.json': honoTsconfig,
  });

  expect(output['tsconfig.json']).toContain('"plugins"');
  expect(output['tsconfig.json']).toContain('"name": "workflow"');
});

test('hono package codemod updates scripts', async () => {
  const output = await runCodemod('hono/package/scripts', {
    'package.json': honoPackageJson,
  });

  expect(output['package.json']).toContain('"dev": "nitro dev"');
  expect(output['package.json']).toContain('"build": "nitro build"');
});
