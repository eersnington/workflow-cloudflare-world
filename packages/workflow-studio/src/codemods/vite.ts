import type { CodemodDefinition } from './types.js';

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

const viteAiPageContent = `import { useState } from 'react';

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

function App() {
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
          <p className="text-sm text-gray-600">AI SDK + Workflow DevKit</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="space-y-4">
            <div className="text-left">
              <label
                htmlFor="pattern-select"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
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
                {PATTERNS.find((p) => p.value === pattern)?.description}
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

export default App;
`;

const viteAiRouteContent = `import { start } from "workflow/api";
import { defineEventHandler } from "nitro/h3";
import { orchestratorWorkflow } from "../workflows/orchestrator-workflow";
import { sequentialWorkflow } from "../workflows/sequential-workflow";

export default defineEventHandler(async ({ req }) => {
  const { pattern } = (await req.json()) as { pattern?: string };
  let run;

  switch (pattern) {
    case "sequential":
      run = await start(sequentialWorkflow, [
        "Vercel Workflow DevKit for building durable workflows that survive restarts",
      ]);
      break;
    case "orchestrator":
      run = await start(orchestratorWorkflow, [
        "Add a dark mode toggle to the dashboard, persist the preference per user, and ensure the UI updates without a full reload.",
      ]);
      break;
    default:
      return { statusCode: 400, statusMessage: "Invalid pattern" };
  }

  return {
    runId: run?.runId,
  };
});
`;

const viteAiPageCodemod: CodemodDefinition = {
  globs: ['src/App.tsx'],
  transform(source) {
    if (!source.includes('__WORKFLOW_VITE_AI_PAGE__')) {
      return null;
    }
    return viteAiPageContent;
  },
};

const viteAiRouteCodemod: CodemodDefinition = {
  globs: ['api/workflows.post.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_VITE_AI_ROUTE__')) {
      return null;
    }
    return viteAiRouteContent;
  },
};

const viteAiSequentialWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return aiSequentialWorkflowContent;
  },
};

const viteAiOrchestratorWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return aiOrchestratorWorkflowContent;
  },
};

export const viteCodemods = {
  'vite/ai/page': viteAiPageCodemod,
  'vite/ai/route': viteAiRouteCodemod,
  'vite/ai/sequential-workflow': viteAiSequentialWorkflowCodemod,
  'vite/ai/orchestrator-workflow': viteAiOrchestratorWorkflowCodemod,
} as const satisfies Record<string, CodemodDefinition>;
