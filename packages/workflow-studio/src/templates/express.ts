import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const expressFiles: TemplateFileFactory = {
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
  'src/index.ts': () => `import express from "express";
import { fromNodeHandler, type NodeMiddleware } from "nitro/h3";
import { start } from "workflow/api";
import { handleUserSignup } from "../workflows/user-signup.js";

const app = express();
app.use(express.json());

app.post("/api/signup", async (req, res) => {
  const { email } = req.body;

  await start(handleUserSignup, [email]);

  return res.json({ message: "User signup workflow started" });
});

export default fromNodeHandler(app as NodeMiddleware);
`,
};

export const expressTemplates: TemplateDefinition = {
  label: 'Express',
  handlebars: 'express',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from an Express route.',
      files: expressFiles,
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
        'src/index.ts': () =>
          `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_EXPRESS_AI_ROUTE__';
`,
      },
      codemods: [
        'express/ai/route',
        'express/ai/sequential-workflow',
        'express/ai/orchestrator-workflow',
      ],
    },
  },
};
