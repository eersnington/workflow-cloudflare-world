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

const nextAiPageContent = `'use client';

import { useState } from 'react';

const PATTERNS = [
  {
    value: 'sequential',
    name: 'Sequential Processing',
    description: 'Marketing copy generation with quality checks',
  },
  {
    value: 'orchestrator',
    name: 'Orchestrator-Worker',
    description: 'Feature implementation planning with parallel workers',
  },
];

export default function Home() {
  const [pattern, setPattern] = useState('sequential');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setSuccess(false);

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pattern }),
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        console.error('Workflow trigger failed');
      }
    } catch (error) {
      console.error('Error triggering workflow:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            AI Workflow Patterns
          </h1>
          <p className="text-sm text-gray-600">
            AI SDK + Workflow DevKit
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="space-y-4">
            <div className="text-left">
              <label htmlFor="pattern-select" className="block text-sm font-medium text-gray-700 mb-2">
                Choose Workflow Pattern
              </label>
              <select
                id="pattern-select"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
              >
                {PATTERNS.map((patternOption) => (
                  <option key={patternOption.value} value={patternOption.value}>
                    {patternOption.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-600">
                {PATTERNS.find(p => p.value === pattern)?.description}
              </p>
            </div>

            <button
              onClick={onSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
            >
              {loading ? 'Starting Workflow...' : 'Run Workflow'}
            </button>
          </div>
        </div>

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800">
              ✓ Workflow triggered successfully — check server logs for execution details.
            </p>
          </div>
        )}
      </div>
    </div>
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

const nextSequentialWorkflowContent = `import { generateObject, generateText } from 'ai';
import { fetch } from 'workflow';
import { z } from 'zod';

const MODEL = 'openai/o4-mini';

export async function sequentialWorkflow(input: string) {
  'use workflow';

  // Uses Workflow's "fetch" step. This allows AI SDK calls
  // to automatically work as steps
  globalThis.fetch = fetch;

  // First step: Generate marketing copy
  const { text: copy } = await generateText({
    model: MODEL,
    prompt: \`Write persuasive marketing copy for: \${input}. Focus on benefits and emotional appeal.\`,
  });

  console.log('[Step 1] Finished', { copy: copy.slice(0, 100) });

  // Perform quality check on copy
  const { object: qualityMetrics } = await generateObject({
    model: MODEL,
    schema: z.object({
      hasCallToAction: z.boolean(),
      emotionalAppeal: z.number().min(1).max(10),
      clarity: z.number().min(1).max(10),
    }),
    prompt: \`Evaluate this marketing copy for:
    1. Presence of call to action (true/false)
    2. Emotional appeal (1-10)
    3. Clarity (1-10)

    Copy to evaluate: \${copy}\`,
  });

  console.log('[Step 2] Finished', { qualityMetrics });

  // If quality check fails, regenerate with more specific instructions
  if (
    !qualityMetrics.hasCallToAction ||
    qualityMetrics.emotionalAppeal < 7 ||
    qualityMetrics.clarity < 7
  ) {
    console.log('Quality check failed, regenerating Step 3...');
    const { text: improvedCopy } = await generateText({
      model: MODEL,
      prompt: \`Rewrite this marketing copy with:
      \${!qualityMetrics.hasCallToAction ? '- A clear call to action' : ''}
      \${qualityMetrics.emotionalAppeal < 7 ? '- Stronger emotional appeal' : ''}
      \${qualityMetrics.clarity < 7 ? '- Improved clarity and directness' : ''}

      Original copy: \${copy}\`,
    });

    console.log('[Step 3] Finished', {
      copy: improvedCopy.slice(0, 100),
      qualityMetrics,
    });
  }
}
`;

const nextOrchestratorWorkflowContent = `import { generateObject } from 'ai';
import { fetch } from 'workflow';
import { z } from 'zod';

const MODEL = 'openai/o4-mini';

export async function orchestratorWorkflow(featureRequest: string) {
  'use workflow';

  // Uses Workflow's "fetch" step. This allows AI SDK calls
  // to automatically work as steps
  globalThis.fetch = fetch;

  // Orchestrator: Plan the implementation
  const { object: implementationPlan } = await generateObject({
    model: MODEL,
    schema: z.object({
      files: z.array(
        z.object({
          purpose: z.string(),
          filePath: z.string(),
          changeType: z.enum(['create', 'modify', 'delete']),
        })
      ),
      estimatedComplexity: z.enum(['low', 'medium', 'high']),
    }),
    system:
      'You are a senior software architect planning feature implementations.',
    prompt: \`Analyze this feature request and create an implementation plan:
    \${featureRequest}\`,
  });

  console.log('[Step 1] Finished', { plan: implementationPlan });

  // Workers: Execute the planned changes
  const fileChanges = await Promise.all(
    implementationPlan.files.map(async (file) => {
      // Each worker is specialized for the type of change
      const workerSystemPrompt = {
        create:
          'You are an expert at implementing new files following best practices and project patterns.',
        modify:
          'You are an expert at modifying existing code while maintaining consistency and avoiding regressions.',
        delete:
          'You are an expert at safely removing code while ensuring no breaking changes.',
      }[file.changeType];

      await generateObject({
        model: MODEL,
        schema: z.object({
          explanation: z.string(),
          code: z.string(),
        }),
        system: workerSystemPrompt,
        prompt: \`Implement the changes for \${file.filePath} to support:
        \${file.purpose}

        Consider the overall feature context:
        \${featureRequest}\`,
      });

      console.log('Finished file change step');
    })
  );

  console.log('Finished orchestrator workflow', {
    plan: implementationPlan,
    changes: fileChanges,
  });
}
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

const nextAiSequentialWorkflow: CodemodDefinition = {
  globs: ['workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return nextSequentialWorkflowContent;
  },
};

const nextAiOrchestratorWorkflow: CodemodDefinition = {
  globs: ['workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return nextOrchestratorWorkflowContent;
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
  'next/ai/sequential-workflow': nextAiSequentialWorkflow,
  'next/ai/orchestrator-workflow': nextAiOrchestratorWorkflow,
  'next/config/with-workflow': nextWithWorkflowConfig,
  'next/typescript/plugin': nextTsconfigPlugin,
} as const satisfies Record<string, CodemodDefinition>;
