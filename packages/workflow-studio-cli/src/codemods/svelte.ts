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

const svelteMinimalWorkflowContent = `import { workflow } from '@workflow/core';

export const example = workflow({
  name: 'example-minimal',
  run: async ({ step }) => {
    const greeting = await step('greet', async () => {
      return 'Hello from Workflow Studio';
    });
    return greeting;
  },
});
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
  globs: ['workflows/example.ts'],
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
  'svelte/vite/plugin': svelteVitePlugin,
  'svelte/typescript/plugin': svelteTsconfigPlugin,
} as const satisfies Record<string, CodemodDefinition>;
