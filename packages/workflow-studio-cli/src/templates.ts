export type TemplateContext = {
  projectName: string;
};

const workflowFile = (
  exampleName: string
) => `import { workflow } from '@workflow/core';

export const example = workflow({
  name: 'example-${exampleName}',
  run: async ({ step }) => {
    const greeting = await step('greet', async () => {
      return 'Hello from Workflow Studio';
    });
    return greeting;
  },
});
`;

export type TemplateExample = {
  label: string;
  description: string;
  files: Record<string, (ctx: TemplateContext) => string>;
};

export type TemplateDefinition = {
  label: string;
  description: string;
  examples: Record<string, TemplateExample>;
};

export const templates: Record<string, TemplateDefinition> = {
  nextjs: {
    label: 'Next.js',
    description: 'Full-stack template using Next.js App Router.',
    examples: {
      minimal: {
        label: 'Minimal workflow starter',
        description: 'Hello-world workflow wired into a basic Next.js app.',
        files: {
          'app/page.tsx': () => `export default function Page() {
  return (
    <main style={{ padding: 32 }}>
      <h1>Workflow Studio</h1>
      <p>Run \`workflow-studio start example\` to execute the sample workflow.</p>
    </main>
  );
}
`,
          'workflows/example.ts': () => workflowFile('minimal'),
        },
      },
      ai: {
        label: 'AI Orchestrator',
        description:
          'Demonstrates chaining steps together to orchestrate reasoning agents.',
        files: {
          'workflows/example.ts':
            () => `import { workflow } from '@workflow/core';

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
          'app/page.tsx': () => `import { Suspense } from 'react';

async function fetchPlan() {
  return ['collect data', 'analyze', 'summarize'];
}

export default async function Page() {
  const plan = await fetchPlan();
  return (
    <main style={{ padding: 32 }}>
      <h1>AI Workflow</h1>
      <Suspense>
        <ol>
          {plan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </Suspense>
    </main>
  );
}
`,
        },
      },
    },
  },
  sveltekit: {
    label: 'SvelteKit',
    description: 'Progressive web app template powered by SvelteKit.',
    examples: {
      minimal: {
        label: 'Minimal workflow starter',
        description: 'Hello-world workflow with a Svelte route.',
        files: {
          'src/routes/+page.svelte': () => `<script lang="ts">
  export let data = { message: 'Hello from Workflow Studio' };
</script>

<main>
  <h1>{data.message}</h1>
  <p>Kick off workflows with \`workflow-studio start example\`.</p>
</main>
`,
          'workflows/example.ts': () => workflowFile('minimal'),
        },
      },
      cron: {
        label: 'Cron orchestrator',
        description: 'Cron-style workflow that schedules work periodically.',
        files: {
          'workflows/example.ts':
            () => `import { workflow } from '@workflow/core';

export const example = workflow({
  name: 'example-cron',
  run: async ({ step }) => {
    return await step('tick', async () => {
      return new Date().toISOString();
    });
  },
});
`,
          'src/routes/+page.svelte': () => `<script lang="ts">
  export let data = { ticks: [] };
</script>

<main>
  <h1>Workflow Scheduler</h1>
  <ul>
    {#each data.ticks as tick}
      <li>{tick}</li>
    {/each}
  </ul>
</main>
`,
        },
      },
    },
  },
};

export type TemplateName = keyof typeof templates;
