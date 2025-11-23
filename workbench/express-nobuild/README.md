# Workflow Express (No Build System) Example

A minimal Express app using `workflow-express`.

## Quick Start

### 1. Install & Run
```bash
pnpm install
pnpm run dev   # Starts server + watch mode (http://localhost:3154)
```

### 2. Trigger Workflow
```bash
curl -X POST http://127.0.0.1:3154/trigger \
  -H 'content-type: application/json' \
  --data '{"name":"Ada"}'
```

## Code Overview

### Server (`server.ts`)
Automatically rebuilds workflows in dev mode via middleware.
```ts
import workflow from 'workflow-express';
import { start } from 'workflow/api';
import { handleGreeting } from '#client'; // Typed import!

app.use(workflow()); // Handles build & routing

app.post('/trigger', async (req, res) => {
  await start(handleGreeting, [req.body.name]);
  res.json({ status: 'started' });
});
```

### Workflow (`workflows/example.ts`)
```ts
export async function handleGreeting(name: string) {
  'use workflow';
  await sayHello(name);
}

async function sayHello(name: string) {
  'use step';
  console.log(`Hello ${name}`);
}
```

## Production Build
```bash
pnpm run build   # Generates bundles + compiles TS
pnpm run start   # Runs pre-built server
```

## Deploy to Vercel (prebuilt)

This package depends on monorepo workspaces (not published). Deploy the prebuilt output:

1) Build locally (generates `.vercel/output`):
```bash
VERCEL_FORCE_PNPM=1 vercel build --prod --cwd .
```

2) Deploy the prebuilt build:
```bash
VERCEL_FORCE_PNPM=1 vercel deploy --prebuilt --prod --cwd .
```