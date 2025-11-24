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

const expressAiRouteContent = `import express from "express";
import { fromNodeHandler, type NodeMiddleware } from "nitro/h3";
import { start } from "workflow/api";
import { orchestratorWorkflow } from "../workflows/orchestrator-workflow.js";
import { sequentialWorkflow } from "../workflows/sequential-workflow.js";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.send(\`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Workflow Studio AI</title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; background: #f6f7fb; margin: 0; padding: 32px; color: #0f172a; }
          .card { max-width: 680px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0 0 6px; font-size: 28px; }
          p { margin: 0 0 14px; color: #475569; }
          label { display: block; font-weight: 600; margin: 12px 0 6px; }
          select, button { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 15px; }
          button { margin-top: 12px; background: #2563eb; color: white; border: none; cursor: pointer; transition: background 0.2s ease; }
          button:disabled { background: #94a3b8; cursor: not-allowed; }
          .success { margin-top: 12px; padding: 12px; background: #ecfdf3; border: 1px solid #bbf7d0; border-radius: 10px; color: #166534; }
          .error { margin-top: 12px; padding: 12px; background: #fef2f2; border: 1px solid #fecdd3; border-radius: 10px; color: #991b1b; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>AI Workflow Patterns</h1>
          <p>AI SDK + Workflow DevKit</p>
          <label for="pattern">Choose Workflow Pattern</label>
          <select id="pattern">
            <option value="sequential">Sequential Processing</option>
            <option value="orchestrator">Orchestrator-Worker</option>
          </select>
          <div id="hint" style="color:#475569;font-size:14px;margin-top:6px;">Marketing copy generation with quality checks</div>
          <button id="run">Run Workflow</button>
          <div id="success" class="success" style="display:none;">✓ Workflow triggered successfully — check server logs for execution details.</div>
          <div id="error" class="error" style="display:none;"></div>
        </div>
        <script>
          const select = document.getElementById('pattern');
          const hint = document.getElementById('hint');
          const runBtn = document.getElementById('run');
          const success = document.getElementById('success');
          const error = document.getElementById('error');
          const hints = {
            sequential: 'Marketing copy generation with quality checks',
            orchestrator: 'Feature implementation planning with parallel workers',
          };
          select.addEventListener('change', () => {
            hint.textContent = hints[select.value] || '';
          });
          runBtn.addEventListener('click', async () => {
            success.style.display = 'none';
            error.style.display = 'none';
            runBtn.disabled = true;
            try {
              const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern: select.value })
              });
              if (res.ok) {
                success.style.display = 'block';
              } else {
                error.textContent = 'Workflow trigger failed';
                error.style.display = 'block';
              }
            } catch (err) {
              error.textContent = 'Unexpected error';
              error.style.display = 'block';
            } finally {
              runBtn.disabled = false;
            }
          });
        </script>
      </body>
    </html>
  \`);
});

app.post("/api/workflows", async (req, res) => {
  const { pattern } = req.body;
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
      return res.status(400).json({ error: "Invalid pattern" });
  }

  return res.json({ runId: run?.runId });
});

export default fromNodeHandler(app as NodeMiddleware);
`;

const expressAiRouteCodemod: CodemodDefinition = {
  globs: ['src/index.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_EXPRESS_AI_ROUTE__')) {
      return null;
    }
    return expressAiRouteContent;
  },
};

const expressAiSequentialWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return aiSequentialWorkflowContent;
  },
};

const expressAiOrchestratorWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return aiOrchestratorWorkflowContent;
  },
};

export const expressCodemods = {
  'express/ai/route': expressAiRouteCodemod,
  'express/ai/sequential-workflow': expressAiSequentialWorkflowCodemod,
  'express/ai/orchestrator-workflow': expressAiOrchestratorWorkflowCodemod,
} as const satisfies Record<string, CodemodDefinition>;
