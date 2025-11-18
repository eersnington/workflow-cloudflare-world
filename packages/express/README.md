# workflow-express

Simple Express middleware for Vercel Workflow DevKit. Add workflows to any Express application with zero configuration.

```bash
npm add workflow workflow-express
```

## Quick Start

1. **Create your workflow files:**

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
  console.log('Webhook Resolved');

  return { userId: user.id, status: 'onboarded' };
}

async function createUser(email: string) {
  'use step';
  console.log(`Creating a new user with email: ${email}`);
  return { id: crypto.randomUUID(), email };
}

async function sendWelcomeEmail(user: { id: string; email: string }) {
  'use step';
  console.log(`Sending welcome email to user: ${user.id}`);
}

async function sendOnboardingEmail(user: { id: string; email: string }, callback: string) {
  'use step';
  console.log(`Sending onboarding email to user: ${user.id}`);
}
```

2. **Build your workflows:**

```bash
workflow build
```

This generates the required handler files in `.well-known/workflow/v1/`:
- `step.js` - Handles step execution
- `flow.js` - Handles workflow execution
- `webhook.js` - Handles webhook delivery
- `client.js` - Workflow functions with metadata for your app

3. **Add the workflow middleware to your Express app:**

```ts
// server.ts
import express from 'express';
import workflow from 'workflow-express';
import { start } from 'workflow/api';
import { handleUserSignup } from 'workflow-express/workflows';

const app = express();

// Add workflow middleware - it's that simple!
app.use(workflow());

app.use(express.json());

// Your existing routes
app.post('/signup', async (req, res) => {
  const { email } = req.body;
  const run = await start(handleUserSignup, [email]);
  res.json({ runId: run.runId });
});

app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000');
});
```

4. **That's it!** The middleware will:
   - Load pre-built workflow handlers
   - Expose the required workflow HTTP endpoints
   - Handle all the protocol details automatically

## Build Process

Express doesn't have a built-in build system like Next.js or Vite, so you need to build workflows manually:

### One-time setup

Add to your `package.json`:

```json
{
  "scripts": {
    "build": "workflow build && tsc",
    "start": "node dist/server.js"
  }
}
```

### Development workflow

```bash
pnpm install
pnpm build    # Build workflows + compile TypeScript
pnpm start    # Start your server
```

## How It Works

Following the [framework integration guide](https://useworkflow.dev/docs/how-it-works/framework-integrations), this middleware:

1. **Builds** workflow handler files using the Workflow DevKit builder
2. **Loads** pre-generated handlers at runtime (no lazy building)
3. **Routes** the three required endpoints to appropriate handlers
4. **Handles** conversion between Express requests and Web API requests

## Configuration Options

The middleware supports basic configuration:

```ts
import workflow from 'workflow-express';

app.use(workflow({
  workflowsDir: 'src/workflows' // Default: 'workflows'
}));
```

## Error Handling

The middleware includes helpful error messages:

- **Missing build files** - Clear message to run `workflow build`
- **Build failures** - Workflow DevKit build errors are logged
- **Runtime errors** - Proper error propagation to your Express error handlers

## Advanced Usage

### Using the Builder Directly

For more control, you can use the Express builder directly:

```ts
import { ExpressBuilder } from 'workflow-express/builder';

const builder = new ExpressBuilder({
  workflowsDir: 'my-workflows'
});

await builder.build();
```

### Custom Workflow Directory

```ts
// server.ts
import workflow from 'workflow-express';

app.use(workflow({
  workflowsDir: 'src/api/workflows'
}));

// Don't forget to update your build too:
// workflow build --workflows-dir src/api/workflows
```

## Deployment

The pre-build approach works perfectly with deployment platforms like Vercel:

1. **Local**: `pnpm build && pnpm start`
2. **Vercel**: Build step runs `workflow build` automatically
3. **Docker**: Include `workflow build` in your Dockerfile

## Learn More

- [Workflow DevKit Documentation](https://useworkflow.dev)
- [Framework Integration Guide](https://useworkflow.dev/docs/how-it-works/framework-integrations)
- [API Reference](https://useworkflow.dev/docs/api-reference)

## Support

- Create issues on [GitHub](https://github.com/vercel/workflow)
- Join discussions in [GitHub Discussions](https://github.com/vercel/workflow/discussions)