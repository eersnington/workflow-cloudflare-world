import type { CodemodDefinition } from './types.js';

const svelteMinimalPageContent = `<script lang="ts">
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
`;

const svelteMinimalWorkflowContent = `import { sleep } from 'workflow';
import { FatalError } from 'workflow';

export async function handleUserSignup(email: string) {
  "use workflow";

  const user = await createUser(email);
  await sendWelcomeEmail(user);

  await sleep('5s');
  await sendOnboardingEmail(user);

  console.log("Workflow is complete! Run 'npx workflow web' to inspect your run");

  return { userId: user.id, status: 'onboarded' };
}

async function createUser(email: string) {
  "use step";

  console.log('Creating user with email: ' + email);

  return { id: crypto.randomUUID(), email };
}

async function sendWelcomeEmail(user: { id: string; email: string }) {
  "use step";

  console.log('Sending welcome email to user: ' + user.id);

  if (Math.random() < 0.3) {
    throw new Error('Retryable!');
  }
}

async function sendOnboardingEmail(user: { id: string; email: string }) {
  "use step";

  if (!user.email.includes('@')) {
    throw new FatalError('Invalid Email');
  }

  console.log('Sending onboarding email to user: ' + user.id);
}
`;

const svelteCronPageContent = `<script lang="ts">
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
`;

const svelteCronWorkflowContent = `import { workflow } from '@workflow/core';

export const example = workflow({
  name: 'example-cron',
  run: async ({ step }) => {
    return await step('tick', async () => {
      return new Date().toISOString();
    });
  },
});
`;

const svelteAiPageContent = `<script lang="ts">
  import { onMount } from 'svelte';

  const patterns = [
    { value: 'sequential', name: 'Sequential Processing', description: 'Marketing copy generation with quality checks' },
    { value: 'orchestrator', name: 'Orchestrator-Worker', description: 'Feature implementation planning with parallel workers' },
  ];

  let pattern = 'sequential';
  let success = false;
  let loading = false;
  let error: string | null = null;

  onMount(() => {
    success = false;
    error = null;
  });

  const onSubmit = async () => {
    loading = true;
    success = false;
    error = null;

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern }),
      });

      if (response.ok) {
        success = true;
      } else {
        error = 'Workflow trigger failed';
      }
    } catch (err) {
      console.error(err);
      error = 'Unexpected error';
    } finally {
      loading = false;
    }
  };
</script>

<div class="page">
  <div class="card">
    <div class="header">
      <h1>AI Workflow Patterns</h1>
      <p>AI SDK + Workflow DevKit</p>
    </div>
    <div class="form">
      <label for="pattern-select">Choose Workflow Pattern</label>
      <select id="pattern-select" bind:value={pattern}>
        {#each patterns as patternOption}
          <option value={patternOption.value}>{patternOption.name}</option>
        {/each}
      </select>
      <p class="description">
        {patterns.find((p) => p.value === pattern)?.description}
      </p>
      <button on:click|preventDefault={onSubmit} disabled={loading}>
        {loading ? 'Starting Workflow...' : 'Run Workflow'}
      </button>
    </div>
    {#if success}
      <div class="success">✓ Workflow triggered successfully — check server logs for execution details.</div>
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #f6f7fb;
  }
  .card {
    width: 100%;
    max-width: 700px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.06);
  }
  .header h1 {
    margin: 0 0 4px;
    font-size: 28px;
    color: #111827;
  }
  .header p {
    margin: 0 0 20px;
    color: #6b7280;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    font-weight: 600;
    color: #111827;
  }
  select {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    font-size: 14px;
    background: #fff;
  }
  .description {
    color: #6b7280;
    font-size: 14px;
  }
  button {
    margin-top: 8px;
    padding: 12px 14px;
    border: none;
    border-radius: 10px;
    background: #2563eb;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  }
  button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  .success {
    margin-top: 12px;
    padding: 10px 12px;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
    border-radius: 10px;
    color: #166534;
    font-size: 14px;
  }
  .error {
    margin-top: 12px;
    padding: 10px 12px;
    background: #fef2f2;
    border: 1px solid #fecdd3;
    border-radius: 10px;
    color: #991b1b;
    font-size: 14px;
  }
</style>
`;

const aiSequentialWorkflowContent = `import { generateObject, generateText } from 'ai';
import { fetch } from 'workflow';
import { z } from 'zod';

const MODEL = 'openai/o4-mini';

export async function sequentialWorkflow(prompt: string) {
  "use workflow";

  const outline = await generateOutline(prompt);
  const draft = await generateDraft(outline);
  const refined = await refineDraft(draft);

  return refined;
}

async function generateOutline(prompt: string) {
  "use step";

  const { object: outline } = await generateObject({
    model: MODEL,
    prompt: \`Create an outline for this marketing copy: "\${prompt}"\`,
    schema: z.object({
      title: z.string(),
      sections: z.array(
        z.object({
          heading: z.string(),
          bullets: z.array(z.string()),
        })
      ),
    }),
  });

  return outline;
}

async function generateDraft(outline: {
  title: string;
  sections: { heading: string; bullets: string[] }[];
}) {
  "use step";

  const { text: draft } = await generateText({
    model: MODEL,
    prompt: \`Write marketing copy with this outline: \${JSON.stringify(outline)}\`,
  });

  return draft;
}

async function refineDraft(draft: string) {
  "use step";

  const { text: refined } = await generateText({
    model: MODEL,
    prompt: \`Rewrite this to be concise and exciting: \${draft}\`,
  });

  return refined;
}
`;

const aiOrchestratorWorkflowContent = `import { generateObject } from 'ai';
import { fetch, spawn } from 'workflow';
import { z } from 'zod';

const MODEL = 'openai/o4-mini';

type Task = {
  name: string;
  description: string;
  owner: string;
};

export async function orchestratorWorkflow(featureRequest: string) {
  "use workflow";

  const plan = await createPlan(featureRequest);
  const results = await runPlan(plan);

  return results;
}

async function createPlan(featureRequest: string): Promise<Task[]> {
  "use step";

  const { object } = await generateObject({
    model: MODEL,
    prompt: \`Create a feature implementation plan for: \${featureRequest}\`,
    schema: z.object({
      tasks: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          owner: z.string(),
        })
      ),
    }),
  });

  return object.tasks;
}

async function runPlan(tasks: Task[]) {
  "use step";

  const results = await Promise.all(
    tasks.map(async (task) => {
      await spawn(workerTask, [task]);
      return { task: task.name, status: 'completed' as const };
    })
  );

  return results;
}

async function workerTask(task: Task) {
  "use step";

  console.log(\`Working on task: \${task.name} (\${task.owner})\`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
`;

const svelteAiRouteContent = `import { start } from 'workflow/api';
import { sequentialWorkflow } from '../../../../workflows/sequential-workflow';
import { orchestratorWorkflow } from '../../../../workflows/orchestrator-workflow';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const { pattern } = await request.json();
  let run;

  switch (pattern) {
    case 'sequential':
      run = await start(sequentialWorkflow, [
        'Vercel Workflow DevKit for building durable workflows that survive restarts',
      ]);
      break;
    case 'orchestrator':
      run = await start(orchestratorWorkflow, [
        'Add a dark mode toggle to the dashboard, persist the preference per user, and ensure the UI updates without a full reload.',
      ]);
      break;
    default:
      return json({ error: 'Invalid pattern' }, { status: 400 });
  }

  return json({ runId: run?.runId });
};
`;
const svelteMinimalPage: CodemodDefinition = {
  globs: ['src/routes/+page.svelte'],
  transform(source) {
    if (!source.includes('<h1>Welcome to SvelteKit</h1>')) {
      return null;
    }
    return svelteMinimalPageContent;
  },
};

const svelteMinimalWorkflow: CodemodDefinition = {
  globs: ['workflows/user-signup.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SVELTE_MINIMAL__')) {
      return null;
    }
    return svelteMinimalWorkflowContent;
  },
};

const svelteCronPage: CodemodDefinition = {
  globs: ['src/routes/+page.svelte'],
  transform(source) {
    if (!source.includes('<h1>Welcome to SvelteKit</h1>')) {
      return null;
    }
    return svelteCronPageContent;
  },
};

const svelteCronWorkflow: CodemodDefinition = {
  globs: ['workflows/example.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SVELTE_CRON__')) {
      return null;
    }
    return svelteCronWorkflowContent;
  },
};

const svelteAiPage: CodemodDefinition = {
  globs: ['src/routes/+page.svelte'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SVELTE_AI_PAGE__')) {
      return null;
    }
    return svelteAiPageContent;
  },
};

const svelteAiRoute: CodemodDefinition = {
  globs: ['src/routes/api/workflows/+server.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SVELTE_AI_ROUTE__')) {
      return null;
    }
    return svelteAiRouteContent;
  },
};

const svelteAiSequentialWorkflow: CodemodDefinition = {
  globs: ['workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return aiSequentialWorkflowContent;
  },
};

const svelteAiOrchestratorWorkflow: CodemodDefinition = {
  globs: ['workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return aiOrchestratorWorkflowContent;
  },
};

const svelteVitePlugin: CodemodDefinition = {
  globs: ['vite.config.ts', 'vite.config.js'],
  transform(source) {
    let updated = source;
    const hasPlugin = updated.includes('workflowPlugin(');

    if (!updated.includes('workflow/sveltekit')) {
      updated = insertImport(
        updated,
        "import { workflowPlugin } from 'workflow/sveltekit';"
      );
    }

    if (!hasPlugin) {
      updated = insertWorkflowPlugin(updated);
    }

    return updated === source ? null : updated;
  },
};

const svelteTsconfigPlugin: CodemodDefinition = {
  globs: ['tsconfig.json'],
  transform(source) {
    const parsed = parseJsonWithComments(source);
    if (!parsed) {
      return null;
    }
    parsed.compilerOptions ??= {};
    const compilerOptions = parsed.compilerOptions as Record<string, unknown>;
    const plugins = Array.isArray(compilerOptions.plugins)
      ? (compilerOptions.plugins as Record<string, unknown>[])
      : [];

    const hasPlugin = plugins.some(
      (plugin) =>
        plugin && typeof plugin === 'object' && plugin.name === 'workflow'
    );

    if (hasPlugin) {
      return null;
    }

    const normalizedPlugins = plugins.filter(
      (plugin): plugin is Record<string, unknown> =>
        Boolean(plugin && typeof plugin === 'object')
    );
    normalizedPlugins.push({ name: 'workflow' });
    compilerOptions.plugins = normalizedPlugins;

    return `${JSON.stringify(parsed, null, 2)}\n`;
  },
};

function insertImport(source: string, statement: string): string {
  const importMatches = [...source.matchAll(/^import .*$/gm)];
  if (importMatches.length === 0) {
    return `${statement}\n${source}`;
  }
  const lastMatch = importMatches[importMatches.length - 1];
  const insertPosition = (lastMatch.index ?? 0) + lastMatch[0].length;
  const before = source.slice(0, insertPosition);
  const after = source.slice(insertPosition);
  const prefix = before.endsWith('\n') ? before : `${before}\n`;
  return `${prefix}${statement}\n${after}`;
}

function insertWorkflowPlugin(source: string): string {
  const pluginsMatch = source.match(/plugins:\s*\[/);
  if (!pluginsMatch || pluginsMatch.index === undefined) {
    return source;
  }
  const bracketIndex = pluginsMatch.index + pluginsMatch[0].length;
  const beforeBracket = source.slice(0, bracketIndex);
  const afterBracket = source.slice(bracketIndex);
  const lineStart = source.lastIndexOf('\n', pluginsMatch.index) + 1;
  const indent = source
    .slice(lineStart, pluginsMatch.index)
    .replace(/[^\s]/g, '');
  const insertion = `\n${indent}  workflowPlugin(),`;
  return `${beforeBracket}${insertion}${afterBracket}`;
}

function parseJsonWithComments(source: string): any | null {
  try {
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, '');
    return JSON.parse(withoutLineComments);
  } catch {
    return null;
  }
}

export const svelteCodemods = {
  'svelte/minimal/page': svelteMinimalPage,
  'svelte/minimal/workflow': svelteMinimalWorkflow,
  'svelte/cron/page': svelteCronPage,
  'svelte/cron/workflow': svelteCronWorkflow,
  'svelte/ai/page': svelteAiPage,
  'svelte/ai/route': svelteAiRoute,
  'svelte/ai/sequential-workflow': svelteAiSequentialWorkflow,
  'svelte/ai/orchestrator-workflow': svelteAiOrchestratorWorkflow,
  'svelte/vite/plugin': svelteVitePlugin,
  'svelte/typescript/plugin': svelteTsconfigPlugin,
} as const satisfies Record<string, CodemodDefinition>;
