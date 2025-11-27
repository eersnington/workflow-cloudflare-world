import type { CodemodDefinition } from './types.js';

const nitroWorkflowContent = `import { FatalError, sleep } from 'workflow';

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

const nitroAiPageContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Workflow Studio AI</title>
    <link rel="stylesheet" href="/public/styles.css" />
  </head>
  <body>
    <div class="app">
      <div class="card">
        <div class="header">
          <h1>AI Workflow Patterns</h1>
          <p>AI SDK + Workflow DevKit</p>
        </div>
        <label class="label" for="pattern">Choose Workflow Pattern</label>
        <select id="pattern" class="input">
          <option value="sequential">Sequential Processing</option>
          <option value="orchestrator">Orchestrator-Worker</option>
        </select>
        <p id="hint" class="hint">Marketing copy generation with quality checks</p>
        <button id="run" class="button">Run Workflow</button>
        <div id="success" class="success hidden">✓ Workflow triggered successfully — check server logs for execution details.</div>
        <div id="error" class="error hidden"></div>
      </div>
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
        success.classList.add('hidden');
        error.classList.add('hidden');
        runBtn.disabled = true;
        try {
          const res = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pattern: select.value }),
          });
          if (res.ok) {
            success.classList.remove('hidden');
          } else {
            error.textContent = 'Workflow trigger failed';
            error.classList.remove('hidden');
          }
        } catch (err) {
          error.textContent = 'Unexpected error';
          error.classList.remove('hidden');
        } finally {
          runBtn.disabled = false;
        }
      });
    </script>
  </body>
</html>
`;

const nitroAiRouteContent = `import { start } from 'workflow/api';
import { defineEventHandler, readBody } from 'h3';
import { orchestratorWorkflow } from '../../workflows/orchestrator-workflow';
import { sequentialWorkflow } from '../../workflows/sequential-workflow';

export default defineEventHandler(async (event) => {
  const { email, pattern } = await readBody<{ email?: string; pattern?: string }>(event);
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
      return { statusCode: 400, statusMessage: 'Invalid pattern' };
  }

  return { runId: run?.runId };
});
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

const nitroConfigCodemod: CodemodDefinition = {
  globs: ['nitro.config.ts'],
  transform(source) {
    if (source.includes('workflow/nitro')) {
      return null;
    }

    const workflowModule = "  modules: ['workflow/nitro'],";

    if (source.includes('modules:')) {
      return source.replace(/modules:\s*\[([^\]]*)\]/, (_, content) => {
        const modules = content.trim()
          ? `${content}, 'workflow/nitro'`
          : "'workflow/nitro'";
        return `modules: [${modules}]`;
      });
    } else {
      return source.replace(
        /export default defineConfig\(\{([^}]*)\}\);/,
        (_, configContent) => {
          const hasExistingOptions = configContent.trim();
          const modulesSection = workflowModule;
          const newContent = hasExistingOptions
            ? `${configContent}\n${modulesSection}`
            : modulesSection;
          return `export default defineConfig({\n${newContent}\n});`;
        }
      );
    }
  },
};

const nitroRouteCodemod: CodemodDefinition = {
  globs: ['server/api/**/*.ts'],
  transform() {
    // This codemod is just to ensure the API route file exists
    // The actual content is already generated by the template
    return null;
  },
};

const nitroWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/user-signup.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NITRO_MINIMAL__')) {
      return null;
    }
    return nitroWorkflowContent;
  },
};

const nitroAiPageCodemod: CodemodDefinition = {
  globs: ['index.html'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NITRO_AI_PAGE__')) {
      return null;
    }
    return nitroAiPageContent;
  },
};

const nitroAiRouteCodemod: CodemodDefinition = {
  globs: ['server/api/workflows.post.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NITRO_AI_ROUTE__')) {
      return null;
    }
    return nitroAiRouteContent;
  },
};

const nitroAiSequentialWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return aiSequentialWorkflowContent;
  },
};

const nitroAiOrchestratorWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return aiOrchestratorWorkflowContent;
  },
};

const nitroTsconfigCodemod: CodemodDefinition = {
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

    if (
      plugins.some(
        (plugin) =>
          plugin && typeof plugin === 'object' && plugin.name === 'workflow'
      )
    ) {
      return null;
    }

    const normalized = plugins.filter(
      (plugin): plugin is Record<string, unknown> =>
        Boolean(plugin && typeof plugin === 'object')
    );
    normalized.push({ name: 'workflow' });
    compilerOptions.plugins = normalized;

    return `${JSON.stringify(parsed, null, 2)}\n`;
  },
};

const nitroPackageScriptsCodemod: CodemodDefinition = {
  globs: ['package.json'],
  transform(source) {
    let parsed: any;
    try {
      parsed = JSON.parse(source);
    } catch {
      return null;
    }

    parsed.scripts ??= {};
    const scripts = parsed.scripts as Record<string, string>;
    let mutated = false;

    if (scripts.dev !== 'nitro dev') {
      scripts.dev = 'nitro dev';
      mutated = true;
    }

    if (scripts.build !== 'nitro build') {
      scripts.build = 'nitro build';
      mutated = true;
    }

    if (scripts.preview !== 'nitro preview') {
      scripts.preview = 'nitro preview';
      mutated = true;
    }

    return mutated ? `${JSON.stringify(parsed, null, 2)}\n` : null;
  },
};

function parseJsonWithComments(source: string): any | null {
  try {
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, '');
    return JSON.parse(withoutLineComments);
  } catch {
    return null;
  }
}

export const nitroCodemods = {
  'nitro/config/with-workflow': nitroConfigCodemod,
  'nitro/api/route': nitroRouteCodemod,
  'nitro/workflow': nitroWorkflowCodemod,
  'nitro/tsconfig/plugin': nitroTsconfigCodemod,
  'nitro/package/scripts': nitroPackageScriptsCodemod,
  'nitro/ai/page': nitroAiPageCodemod,
  'nitro/ai/route': nitroAiRouteCodemod,
  'nitro/ai/sequential-workflow': nitroAiSequentialWorkflowCodemod,
  'nitro/ai/orchestrator-workflow': nitroAiOrchestratorWorkflowCodemod,
} as const satisfies Record<string, CodemodDefinition>;
