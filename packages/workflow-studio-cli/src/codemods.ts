type CodemodDefinition = {
  rule: string;
  globs?: string[];
};

const codemodDefinitions = {
  'next/minimal/page': {
    globs: ['app/page.tsx'],
    rule: `id: workflow-next-minimal-page
language: tsx
rule:
  kind: program
  all:
    - has:
        pattern: |
          import Image from "next/image";
    - has:
        pattern: |
          export default function Home() {
            $A
          }
fix: |-
  export default function Page() {
    return (
      <main className="min-h-screen bg-zinc-950 px-8 py-16 text-zinc-50">
        <section className="mx-auto max-w-3xl space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Workflow Studio
          </p>
          <h1 className="text-4xl font-semibold">Create your first workflow.</h1>
          <p className="text-lg text-zinc-300">
            Run{' '}
            <code className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-sm">
              workflow-studio start example
            </code>{' '}
            to execute the sample workflow.
          </p>
        </section>
      </main>
    );
  }
`,
  },
  'next/minimal/workflow': {
    globs: ['workflows/example.ts'],
    rule: `id: workflow-next-minimal-workflow
language: ts
rule:
  kind: program
  has:
    kind: string_literal
    regex: "__WORKFLOW_NEXT_MINIMAL__"
fix: |-
  import { workflow } from '@workflow/core';

  export const example = workflow({
    name: 'example-minimal',
    run: async ({ step }) => {
      const greeting = await step('greet', async () => {
        return 'Hello from Workflow Studio';
      });
      return greeting;
    },
  });
`,
  },
  'next/ai/page': {
    globs: ['app/page.tsx'],
    rule: `id: workflow-next-ai-page
language: tsx
rule:
  kind: program
  all:
    - has:
        pattern: |
          import Image from "next/image";
    - has:
        pattern: |
          export default function Home() {
            $A
          }
fix: |-
  import { Suspense } from 'react';

  async function loadPlan() {
    return ['collect data', 'analyze', 'summarize'];
  }

  export default async function Page() {
    const plan = await loadPlan();
    return (
      <main className="min-h-screen bg-slate-950 px-8 py-16 text-slate-100">
        <section className="mx-auto flex max-w-4xl flex-col gap-10 lg:flex-row">
          <div className="flex-1 space-y-4">
            <p className="text-sm font-mono uppercase tracking-[0.3em] text-indigo-300">
              AI Orchestrator
            </p>
            <h1 className="text-4xl font-semibold">Reason through each step.</h1>
            <p className="text-lg text-slate-300">
              Every list item maps to a workflow step so you can fan-out tasks,
              observe state, and iterate quickly.
            </p>
          </div>
          <Suspense fallback={<div>Loading plan...</div>}>
            <ol className="flex-1 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/50">
              {plan.map((item, index) => (
                <li
                  key={item}
                  className="flex items-start gap-4 text-lg text-slate-100"
                >
                  <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium capitalize">{item}</p>
                    <p className="text-sm text-slate-400">
                      Output recorded as <code>task-{item}</code>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Suspense>
        </section>
      </main>
    );
  }
`,
  },
  'next/ai/workflow': {
    globs: ['workflows/example.ts'],
    rule: `id: workflow-next-ai-workflow
language: ts
rule:
  kind: program
  has:
    kind: string_literal
    regex: "__WORKFLOW_NEXT_AI__"
fix: |-
  import { workflow } from '@workflow/core';

  export const example = workflow({
    name: 'example-ai',
    run: async ({ step }) => {
      const plan = await step('plan', async () => {
        return ['collect data', 'analyze', 'summarize'];
      });

      const results = [];
      for (const task of plan) {
        const result = await step(\`task-\${task}\`, async () => {
          return \`Completed: \${task}\`;
        });
        results.push(result);
      }

      return results;
    },
  });
`,
  },
  'svelte/minimal/page': {
    globs: ['src/routes/+page.svelte'],
    rule: `id: workflow-svelte-minimal-page
language: html
rule:
  pattern: |
    <h1>Welcome to SvelteKit</h1>
    <p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
fix: |-
  <script lang="ts">
    export let data = { message: 'Hello from Workflow Studio' };
  </script>

  <main class="min-h-screen bg-zinc-950 px-8 py-16 text-zinc-50">
    <section class="mx-auto max-w-3xl space-y-6">
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
        Workflow Studio
      </p>
      <h1 class="text-4xl font-semibold">{data.message}</h1>
      <p class="text-lg text-zinc-300">
        Run <code class="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-sm">workflow-studio start example</code> to
        execute the sample workflow.
      </p>
    </section>
  </main>
`,
  },
  'svelte/minimal/workflow': {
    globs: ['workflows/example.ts'],
    rule: `id: workflow-svelte-minimal-workflow
language: ts
rule:
  kind: program
  has:
    kind: string_literal
    regex: "__WORKFLOW_SVELTE_MINIMAL__"
fix: |-
  import { workflow } from '@workflow/core';

  export const example = workflow({
    name: 'example-minimal',
    run: async ({ step }) => {
      const greeting = await step('greet', async () => {
        return 'Hello from Workflow Studio';
      });
      return greeting;
    },
  });
`,
  },
  'svelte/cron/page': {
    globs: ['src/routes/+page.svelte'],
    rule: `id: workflow-svelte-cron-page
language: html
rule:
  pattern: |
    <h1>Welcome to SvelteKit</h1>
    <p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
fix: |-
  <script lang="ts">
    export let data = { ticks: [] };
  </script>

  <main class="min-h-screen bg-slate-950 px-8 py-16 text-slate-50">
    <section class="mx-auto max-w-3xl space-y-6">
      <p class="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-300">
        Workflow Scheduler
      </p>
      <h1 class="text-4xl font-semibold">Cron-style workflow executions</h1>
      <ul class="space-y-2 text-lg text-slate-200">
        {#each data.ticks as tick, index}
          <li class="rounded border border-slate-800 bg-slate-900 px-4 py-3">
            <span class="font-mono text-sm text-slate-400">Run #{index + 1}</span>
            <div>{tick}</div>
          </li>
        {/each}
      </ul>
    </section>
  </main>
`,
  },
  'svelte/cron/workflow': {
    globs: ['workflows/example.ts'],
    rule: `id: workflow-svelte-cron-workflow
language: ts
rule:
  kind: program
  has:
    kind: string_literal
    regex: "__WORKFLOW_SVELTE_CRON__"
fix: |-
  import { workflow } from '@workflow/core';

  export const example = workflow({
    name: 'example-cron',
    run: async ({ step }) => {
      return await step('tick', async () => {
        return new Date().toISOString();
      });
    },
  });
`,
  },
} as const satisfies Record<string, CodemodDefinition>;

export type CodemodId = keyof typeof codemodDefinitions;

export function getCodemodDefinition(id: CodemodId): CodemodDefinition {
  return codemodDefinitions[id];
}
