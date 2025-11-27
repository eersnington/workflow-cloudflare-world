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

const nuxtAiPageContent = `<template>
  <div class="page">
    <div class="card">
      <div class="header">
        <h1>AI Workflow Patterns</h1>
        <p>AI SDK + Workflow DevKit</p>
      </div>
      <label class="label" for="pattern">Choose Workflow Pattern</label>
      <select id="pattern" v-model="pattern" class="input">
        <option value="sequential">Sequential Processing</option>
        <option value="orchestrator">Orchestrator-Worker</option>
      </select>
      <p class="hint">{{ hint }}</p>
      <button class="button" :disabled="loading" @click="onSubmit">
        {{ loading ? 'Starting Workflow...' : 'Run Workflow' }}
      </button>
      <div v-if="success" class="success">✓ Workflow triggered successfully — check server logs for execution details.</div>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const pattern = ref('sequential');
const success = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

const hints: Record<string, string> = {
  sequential: 'Marketing copy generation with quality checks',
  orchestrator: 'Feature implementation planning with parallel workers',
};

const hint = computed(() => hints[pattern.value] || '');

const onSubmit = async () => {
  loading.value = true;
  success.value = false;
  error.value = null;

  try {
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: pattern.value }),
    });

    if (res.ok) {
      success.value = true;
    } else {
      error.value = 'Workflow trigger failed';
    }
  } catch (err) {
    console.error(err);
    error.value = 'Unexpected error';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
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
.label {
  font-weight: 600;
  color: #111827;
  margin-bottom: 6px;
  display: block;
}
.input, .button, select {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 15px;
}
.button {
  margin-top: 12px;
  background: #2563eb;
  color: white;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;
}
.button:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
.hint {
  color: #6b7280;
  font-size: 14px;
  margin: 8px 0 0;
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

const nuxtAiRouteContent = `import { start } from 'workflow/api';
import { defineEventHandler, readBody } from 'h3';
import { orchestratorWorkflow } from '../workflows/orchestrator-workflow';
import { sequentialWorkflow } from '../workflows/sequential-workflow';

export default defineEventHandler(async (event) => {
  const { pattern } = await readBody<{ pattern?: string }>(event);
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

const nuxtAiPageCodemod: CodemodDefinition = {
  globs: ['app/app.vue'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NUXT_AI_PAGE__')) {
      return null;
    }
    return nuxtAiPageContent;
  },
};

const nuxtAiRouteCodemod: CodemodDefinition = {
  globs: ['server/api/workflows.post.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_NUXT_AI_ROUTE__')) {
      return null;
    }
    return nuxtAiRouteContent;
  },
};

const nuxtAiSequentialWorkflowCodemod: CodemodDefinition = {
  globs: ['server/workflows/sequential-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_SEQUENTIAL__')) {
      return null;
    }
    return aiSequentialWorkflowContent;
  },
};

const nuxtAiOrchestratorWorkflowCodemod: CodemodDefinition = {
  globs: ['server/workflows/orchestrator-workflow.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_ORCHESTRATOR__')) {
      return null;
    }
    return aiOrchestratorWorkflowContent;
  },
};

export const nuxtCodemods = {
  'nuxt/ai/page': nuxtAiPageCodemod,
  'nuxt/ai/route': nuxtAiRouteCodemod,
  'nuxt/ai/sequential-workflow': nuxtAiSequentialWorkflowCodemod,
  'nuxt/ai/orchestrator-workflow': nuxtAiOrchestratorWorkflowCodemod,
} as const satisfies Record<string, CodemodDefinition>;
