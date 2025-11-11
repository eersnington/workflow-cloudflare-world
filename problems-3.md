# Cloudflare Workflow Transformation Plan

## Problem Statement

Workflow functions use `node:vm` and `eval()` which don't work in Cloudflare Workers. The existing `workflowPlugin()` transforms workflow functions to run in workers using VM execution, but this fails in Cloudflare environment.

## Solution Overview

Create a Cloudflare-specific transformer that intercepts workflow execution and redirects it from Workers to Containers, while maintaining compatibility with the existing workflow system.

## Current Architecture

```
workflowPlugin() → Transforms "use workflow" functions → VM execution in workers
```

## Target Architecture

```
workflowPlugin() → Transforms workflow functions → cloudflareTransformer() → Container execution
```

## Implementation Plan

### Phase 1: Create Cloudflare Workflow Transformer

**Location:** `packages/world-cloudflare/src/vite-plugin.ts`

**Purpose:** Transform VM-based workflow execution to container-based execution

**Key Functions:**
1. **Detect VM Execution Code** - Find calls to `runWorkflow()` and VM context creation
2. **Replace with Container Calls** - Generate HTTP calls to workflow containers
3. **Preserve Metadata** - Keep workflow registration and metadata intact
4. **Handle Serialization** - Ensure proper argument/return value serialization

### Phase 2: Container Execution Interface

**Location:** `packages/world-cloudflare/src/container-executor.ts`

**Purpose:** Handle communication between workers and workflow containers

**Key Components:**
1. **HTTP Client** - Make requests to workflow containers
2. **Serialization Layer** - Convert data between worker and container formats
3. **Error Handling** - Transform container errors to workflow errors
4. **Retry Logic** - Handle container failures appropriately

### Phase 3: Integration and Export

**Location:** `packages/world-cloudflare/src/index.ts`

**Purpose:** Export the transformer for easy integration

**Exports:**
```typescript
export { cloudflareWorkflowTransformer } from './vite-plugin';
export { ContainerExecutor } from './container-executor';
```

## Plugin Integration

### User Configuration

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-world';

export default defineConfig({
  plugins: [
    workflowPlugin(),
    cloudflareWorkflowTransformer(),
    sveltekit()
  ],
  // ... existing config
});
```

### Transformation Process

1. **workflowPlugin()** transforms:
   ```typescript
   // Input
   export function myWorkflow(input: string) {
     "use workflow";
     return someStep(input);
   }

   // Output (current)
   globalThis.__private_workflows.set('myWorkflow', async function(input) {
     // VM execution code
   });
   ```

2. **cloudflareWorkflowTransformer()** transforms:
   ```typescript
   // Input (from workflowPlugin)
   globalThis.__private_workflows.set('myWorkflow', async function(input) {
     // VM execution code
   });

   // Output (our transformation)
   globalThis.__private_workflows.set('myWorkflow', async function(input) {
     return await executeWorkflowInContainer('myWorkflow', arguments);
   });
   ```

## Container Execution Flow

### 1. Worker Side
```typescript
async function executeWorkflowInContainer(workflowName: string, args: any[]) {
  const containerUrl = `http://workflow-container:${env.CONTAINER_PORT}/execute`;

  const response = await fetch(containerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflowName,
      args: serializeArgs(args),
      context: getWorkflowContext()
    })
  });

  return deserializeResult(await response.json());
}
```

### 2. Container Side
```typescript
// Existing WorkflowExecutorContainer handles this
async function executeWorkflow(workflowName: string, args: any[], context: any) {
  // Use existing runWorkflow() with node:vm support
  return await runWorkflow(workflowCode, workflowRun, events);
}
```

## Benefits

1. **Zero Breaking Changes** - Existing workflow code works unchanged
2. **Leverages Existing Infrastructure** - Uses current container system
3. **Preserves Step Functions** - Steps continue running efficiently in workers
4. **Deterministic Execution** - Containers provide required VM environment
5. **Easy Integration** - Simple plugin addition to vite config

## Files to Create/Modify

### New Files
- `packages/world-cloudflare/src/vite-plugin.ts` - Main transformer plugin
- `packages/world-cloudflare/src/container-executor.ts` - Container communication
- `packages/world-cloudflare/src/transform-utils.ts` - Transformation utilities
- `packages/world-cloudflare/src/types.ts` - TypeScript definitions

### Modified Files
- `packages/world-cloudflare/src/index.ts` - Export new functionality
- `packages/world-cloudflare/package.json` - Add vite as peer dependency
