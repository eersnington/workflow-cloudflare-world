# workflow-express

Simple Express middleware for Vercel Workflow DevKit. Add workflows to any Express application with zero configuration.

```bash
npm add workflow workflow-express
```

## Quick Start

### 1. Create a workflow
Create a file in `workflows/` (e.g. `workflows/user-signup.ts`):

```ts
import { sleep } from 'workflow';

export async function handleUserSignup(email: string) {
  'use workflow'; // Required: Marks this as a workflow

  await sendWelcomeEmail(email);
  await sleep('1m');
  await sendFollowUpEmail(email);
}

async function sendWelcomeEmail(email: string) {
  'use step'; // Required: Marks this as a step
  console.log(`Sent welcome to ${email}`);
}

async function sendFollowUpEmail(email: string) {
  'use step';
  console.log(`Sent follow-up to ${email}`);
}
```

### 2. Add middleware to your server

```ts
// src/server.ts
import express from 'express';
import workflow from 'workflow-express';
import { start } from 'workflow/api';

// Import directly from the generated bundle for full type safety
// Note: Run 'workflow build' once to generate this file initially
import { handleUserSignup } from '../.well-known/workflow/v1/client';

const app = express();

// 1. Add middleware
app.use(workflow());
app.use(express.json());

// 2. Trigger workflows from your routes
app.post('/signup', async (req, res) => {
  const { email } = req.body;
  
  // Fully typed execution!
  const run = await start(handleUserSignup, [email]);
  
  res.json({ runId: run.runId });
});

app.listen(3000);
```

### 3. Run it

**Development:**
The middleware automatically watches and rebuilds your workflows in development.
```bash
# Just start your server normally
# (Ensure your server restarts on file changes, e.g. using nodemon or node --watch)
node --watch dist/server.js
```

**Production:**
Build workflows once before starting your server.
```bash
# 1. Build workflows
npx workflow build

# 2. Start server
node dist/server.js
```

---

## API Reference

### `workflow(options?)`

Creates the Express middleware.

```ts
import workflow from 'workflow-express';

app.use(workflow({
  // options
}));
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `dirs` | `string[]` | `['workflows']` | Directories to scan for workflow files. |
| `dev` | `boolean` | `process.env.NODE_ENV !== 'production'` | Enable watch mode. If `true`, the middleware starts a background builder that watches `dirs` and regenerates the client bundle on change. |
| `outputDir` | `string` | `.well-known/workflow/v1` | Directory where generated files are written. |

### Generated Client Bundle

The build process generates a type-safe client library at `.well-known/workflow/v1/client.js`.

**Recommended:** Use [Subpath Imports](https://nodejs.org/api/packages.html#subpath-imports) for cleaner imports.

**package.json:**
```json
{
  "imports": {
    "#client": "./.well-known/workflow/v1/client.js"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "#client": ["./.well-known/workflow/v1/client.js"]
    }
  }
}
```

**Usage:**
```ts
import { myWorkflow } from '#client';
```

## Deployment

Deploying to Vercel, Docker, or any Node.js host is simple. Ensure `workflow build` runs during your build phase.

**package.json:**
```json
{
  "scripts": {
    "build": "workflow build && tsc",
    "start": "node dist/server.js"
  }
}
```
