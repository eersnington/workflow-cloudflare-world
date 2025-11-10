# Issue Report: Workflow Functions Cannot Run in Cloudflare Workers

## Problem Statement
Workflow functions use `node:vm` and `eval()` which are not supported in Cloudflare Workers runtime. The workflow system is designed to execute workflow functions in a sandboxed VM environment, but Cloudflare Workers don't provide the necessary Node.js APIs.

## Error Manifestation
1. **Build Error**: `ERR_MODULE_NOT_FOUND: Cannot find package '@workflow/world'`
2. **Runtime Error**: `ReferenceError: runInContext is not defined`
3. **Module Resolution**: Workflow core tries to import `node:vm` which doesn't exist in Workers
4. **Container Requirements**: Workflow functions need Node.js VM environment for deterministic execution

## Root Cause Analysis

### 1. Workflow Architecture Incompatibility
- **Workflow functions** (`"use workflow"`) are designed to run in VM sandbox using `node:vm`
- **Step functions** (`"use step"`) run in regular Node.js environment
- **Cloudflare Workers** don't support `node:vm`, `eval()`, or other Node.js APIs
- **Workflow core** depends on these APIs for deterministic execution

### 2. Current Execution Flow
```
workflowPlugin() → transforms workflow functions → VM execution using node:vm → FAILS in Workers
```

### 3. Container Solution Requirements
- Workflow functions need to run in Cloudflare **Containers** (not Workers)
- Step functions can continue running in Workers
- Need communication layer between Workers and Containers
- Container bundle needs full Node.js runtime support

## Solutions Attempted

### 1. Module Resolution Fixes
- **Status**: ❌ FAILED
- **Attempts**: External configuration, dependency analysis, clean rebuilds
- **Result**: Cannot fix fundamental incompatibility with Workers runtime

### 2. Patch Script Updates
- **Status**: ✅ COMPLETED
- **Action**: Fixed `scripts/patch-worker.mjs` for proper queue handling
- **Result**: Queue system works, but workflow execution still fails

### 3. VM Replacement Attempts
- **Status**: ❌ FAILED
- **Attempts**: Trying to make node:vm work in Workers environment
- **Result**: Workers runtime fundamentally doesn't support these APIs

## Core Issue
The fundamental problem is architectural mismatch:

**Workflow System Requirements:**
- `node:vm` for sandboxed execution
- `eval()` for dynamic code execution
- Deterministic timestamps and random seeds
- Full Node.js runtime environment

**Cloudflare Workers Capabilities:**
- V8 isolate without Node.js APIs
- No `node:vm` module
- No `eval()` or similar VM APIs
- Limited runtime environment

## Required Solution
Transform the execution model to move workflow functions from Workers to Containers:

### Target Architecture
```
workflowPlugin() → transforms workflow functions → Container execution via HTTP calls
```

### Implementation Strategy
1. **Create Cloudflare Transformer** - Intercept workflow execution and route to containers
2. **Container Runtime** - Execute workflow functions in containers with full Node.js support
3. **Communication Layer** - Handle serialization between Workers and Containers
4. **Preserve Step Functions** - Keep step execution in Workers for efficiency

### Files to Create
- `packages/world-cloudflare/src/vite-plugin.ts` - Transform workflow execution
- `packages/world-cloudflare/src/container-executor.ts` - Container communication
- `packages/world-cloudflare/src/transform-utils.ts` - Transformation utilities

## Current Status
- **Step Functions**: ✅ Work in Workers (no changes needed)
- **Workflow Functions**: ❌ Cannot execute in Workers due to VM requirements
- **Container Infrastructure**: ✅ Already exists in workflow-cloudflare-world
- **Build System**: ❌ Needs transformation to redirect workflow execution
- **Local Development**: ❌ Blocked by workflow execution failure

## Success Criteria
1. ✅ Workflow functions execute successfully in containers
2. ✅ Step functions continue running efficiently in workers
3. ✅ Existing workflow code requires no changes
4. ✅ Deterministic execution is preserved in containers
5. ✅ Performance is acceptable for production use

---
