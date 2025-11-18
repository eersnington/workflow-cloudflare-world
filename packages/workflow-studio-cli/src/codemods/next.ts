import type { CodemodDefinition } from './types.js';

const nextMinimalPageContent = `export default function Page() {
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
`;

const nextAiPageContent = `import { Suspense } from 'react';

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
`;

const nextMinimalWorkflowContent = `import { sleep } from 'workflow';
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

const nextAiWorkflowContent = `import { workflow } from 'workflow';

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
`;

const nextMinimalPage: CodemodDefinition = {
  globs: ['app/page.tsx'],
  transform(source) {
    const hasDefaultImports =
      source.includes('import Image from "next/image"') ||
      source.includes("import Image from 'next/image'");
    if (
      !hasDefaultImports ||
      !source.includes('export default function Home')
    ) {
      return null;
    }
    return nextMinimalPageContent;
  },
};

const nextMinimalWorkflow: CodemodDefinition = {
  globs: ['workflows/user-signup.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NEXT_MINIMAL__')) {
      return null;
    }
    return nextMinimalWorkflowContent;
  },
};

const nextAiPage: CodemodDefinition = {
  globs: ['app/page.tsx'],
  transform(source) {
    const hasDefaultImports =
      source.includes('import Image from "next/image"') ||
      source.includes("import Image from 'next/image'");
    if (
      !hasDefaultImports ||
      !source.includes('export default function Home')
    ) {
      return null;
    }
    return nextAiPageContent;
  },
};

const nextAiWorkflow: CodemodDefinition = {
  globs: ['workflows/user-signup.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NEXT_AI__')) {
      return null;
    }
    return nextAiWorkflowContent;
  },
};

const nextWithWorkflowConfig: CodemodDefinition = {
  globs: ['next.config.ts', 'next.config.js', 'next.config.mjs'],
  transform(source) {
    if (source.includes('withWorkflow(')) {
      return null;
    }
    let updated = source;

    if (!updated.includes('workflow/next')) {
      updated = insertImport(
        updated,
        "import { withWorkflow } from 'workflow/next';"
      );
    }

    const replaced = updated.replace(
      /export default\s+nextConfig\s*;?/,
      'export default withWorkflow(nextConfig);\n'
    );

    if (replaced === updated) {
      return null;
    }
    return replaced;
  },
};

const nextTsconfigPlugin: CodemodDefinition = {
  globs: ['tsconfig.json'],
  transform(source) {
    let parsed: any;
    try {
      parsed = JSON.parse(source);
    } catch {
      return null;
    }

    parsed.compilerOptions ??= {};
    const compilerOptions = parsed.compilerOptions as Record<string, unknown>;
    const existingPlugins = Array.isArray(compilerOptions.plugins)
      ? (compilerOptions.plugins as Record<string, unknown>[])
      : [];

    const hasWorkflowPlugin = existingPlugins.some(
      (plugin) =>
        plugin && typeof plugin === 'object' && plugin.name === 'workflow'
    );

    if (hasWorkflowPlugin) {
      return null;
    }

    const nextPlugins = existingPlugins.filter(
      (plugin): plugin is Record<string, unknown> =>
        Boolean(plugin && typeof plugin === 'object')
    );
    nextPlugins.push({ name: 'workflow' });
    compilerOptions.plugins = nextPlugins;

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

export const nextCodemods = {
  'next/minimal/page': nextMinimalPage,
  'next/minimal/workflow': nextMinimalWorkflow,
  'next/ai/page': nextAiPage,
  'next/ai/workflow': nextAiWorkflow,
  'next/config/with-workflow': nextWithWorkflowConfig,
  'next/typescript/plugin': nextTsconfigPlugin,
} as const satisfies Record<string, CodemodDefinition>;
