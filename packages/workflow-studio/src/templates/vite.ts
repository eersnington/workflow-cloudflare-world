import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const viteFiles: TemplateFileFactory = {
  'workflows/user-signup.ts': () => `import { sleep } from 'workflow';
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
`,
  'api/signup.post.ts': () => `import { start } from "workflow/api";
import { defineEventHandler } from "nitro/h3";
import { handleUserSignup } from "../workflows/user-signup";

export default defineEventHandler(async ({ req }) => {
  const { email } = (await req.json()) as { email: string };

  await start(handleUserSignup, [email]);

  return {
    message: "User signup workflow started",
  };
});
`,
};

export const viteTemplates: TemplateDefinition = {
  label: 'Vite',
  handlebars: 'vite',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description:
        'Hello-world workflow triggered from a Vite + Nitro handler.',
      files: viteFiles,
    },
    ai: {
      label: 'AI Workflows',
      description:
        'Sequential marketing copy generation and orchestrator feature planning with AI SDK.',
      placeholders: {
        'workflows/sequential-workflow.ts': () =>
          `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SEQUENTIAL__';
`,
        'workflows/orchestrator-workflow.ts': () =>
          `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_ORCHESTRATOR__';
`,
        'api/workflows.post.ts': () =>
          `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_VITE_AI_ROUTE__';
`,
        'src/App.tsx': () =>
          `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_VITE_AI_PAGE__';
`,
      },
      codemods: [
        'vite/ai/page',
        'vite/ai/route',
        'vite/ai/sequential-workflow',
        'vite/ai/orchestrator-workflow',
      ],
    },
  },
};
