# Workflow Express Example

A minimal Express app demonstrating the simplified workflow-express middleware. This example shows how to add workflows to any Express application with proper build integration.

## What it does

1. **Pre-build workflow handlers** using `workflow build` (recommended approach)
2. **Simple middleware usage** with `app.use(workflow())`
3. **Direct workflow imports** from client bundle with metadata
4. **Works with both local and Vercel deployments**

## Commands

```bash
pnpm install
pnpm run build    # Build workflows + TypeScript compilation
pnpm run start    # Start http://localhost:3154
pnpm run dev      # Watch mode for TypeScript changes
```

## Development Workflow

### 1. Create/Edit Workflows

Edit files in the `workflows/` directory. The example has `workflows/example.ts`.

```ts
// workflows/example.ts
import { sleep } from 'workflow';

export async function handleGreeting(name: string) {
  'use workflow';

  await sayHello(name);
  await sleep('1s');
  await sayHello(`${name}, again`);
}

async function sayHello(name: string) {
  'use step';
  console.log(`[express] Hello ${name}`);
}
```

### 2. Build Your Project

```bash
pnpm run build
```

This runs:
1. `workflow build` - Generates workflow handlers with metadata
2. `tsc` - Compiles TypeScript to JavaScript

### 3. Start the Server

```bash
pnpm run start
```

## Try it out

While the server is running, trigger the example workflow:

```bash
curl -X POST http://127.0.0.1:3154/trigger \
  -H 'content-type: application/json' \
  --data '{"name":"Ada"}'
```

You should see console output showing the workflow execution:
```
[express] Hello Ada
[express] Hello Ada, again
```

## Key Changes from Before

### Build Process
**Before (complex):**
```bash
pnpm run build    # Only compiled TypeScript
pnpm run start    # Tried to build workflows at runtime
```

**After (simple):**
```bash
pnpm run build    # Build workflows + compile TypeScript
pnpm run start    # Just start the server
```

### Workflow Imports
**Before (complex runtime loading):**
```ts
import { getWorkflow } from 'workflow-express/workflows';
const handleGreeting = await getWorkflow('handleGreeting');
```

**After (direct from client bundle):**
```ts
import { handleGreeting } from 'workflow-express/workflows';
```

### Error Handling
The middleware now provides clear error messages if you forget to build:

```
Workflow files not found. Please run "workflow build" before starting your server.
```

## Why This Approach Works

1. **Follows Framework Integration Guide** - Uses the recommended BaseBuilder pattern
2. **Reliable and Predictable** - No runtime building complexity
3. **Works Everywhere** - Same approach works locally and on Vercel
4. **Clear Separation** - Build time vs runtime concerns are properly separated
5. **Proper Metadata** - Client bundle provides workflow functions with required workflowId

## File Structure After Build

```
.
├── .well-known/
│   └── workflow/
│       ├── v1/
│       │   ├── step.js      # Generated (ESM format)
│       │   ├── flow.js      # Generated (ESM format)
│       │   ├── webhook.js   # Generated (ESM format)
│       │   └── client.js    # Generated (workflow functions with metadata)
│       └── manifest.json    # Generated (workflow metadata)
├── dist/
│   └── server.js            # Compiled TypeScript
├── workflows/
│   └── example.ts           # Your source workflow files
└── package.json
```

## Deployment

This approach works perfectly for deployment:

- **Vercel**: Build step runs `workflow build && tsc`
- **Docker**: Include build step in Dockerfile
- **Any Node.js hosting**: Same build process

The generated files are all pre-built and ready for deployment, just like a traditional web application.