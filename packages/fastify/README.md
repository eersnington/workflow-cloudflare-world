# @workflow/fastify

Fastify plugin for Vercel Workflow DevKit that automatically exposes the standard workflow HTTP routes and builds the runtime artifacts when the plugin registers.

```bash
npm add workflow workflow-fastify
```

## Quick Start

### 1. Create your workflows

```ts
// workflows/user-signup.ts
import { sleep, createWebhook } from 'workflow';

export async function handleUserSignup(email: string) {
  'use workflow';

  const user = await createUser(email);
  await sendWelcomeEmail(user);

  await sleep('5s');

  const webhook = createWebhook();
  await sendOnboardingEmail(user, webhook.url);

  await webhook;
  return { userId: user.id };
}

async function createUser(email: string) {
  'use step';
  return { id: crypto.randomUUID(), email };
}

async function sendWelcomeEmail(user: { id: string; email: string }) {
  'use step';
  console.log(`Sending welcome email to ${user.email}`);
}

async function sendOnboardingEmail(user: { id: string; email: string }, callback: string) {
  'use step';
  console.log('Callback URL:', callback);
}
```

### 2. Build workflows (optional in development)

```bash
npx workflow build
```

Fastify will also run the builder automatically when the plugin registers, but running `workflow build` remains useful for CI and production deployments.

### 3. Register the plugin

```ts
// server.ts
import Fastify from 'fastify';
import workflow from '@workflow/fastify';
import { start } from 'workflow/api';

const app = Fastify({ logger: true });

await app.register(workflow, {
  dirs: ['workflows'],
  workflowManifestPath: '.well-known/workflow/manifest.json',
  hmr: process.env.NODE_ENV !== 'production',
});

app.post('/signup', async (req, reply) => {
  const { email } = req.body as { email: string };
  const run = await start(handleUserSignup, [email]);
  return { runId: run.runId };
});

await app.listen({ port: 3000 });
```

## Configuration highlights

- `dirs`/`outputDir`: Where your workflow source files live and where the `.well-known/workflow/v1` handlers are emitted.
- `workflowManifestPath`: Writes a manifest so you can annotate workflows or seed other tooling.
- `prefix`: Change the HTTP prefix under which Fastify serves `flow`, `step`, and `webhook` routes.
- `logging`, `caching`, `validation`: Mirror Fastify behaviors.
- `hmr`: Enables workflow rebuilds during development.