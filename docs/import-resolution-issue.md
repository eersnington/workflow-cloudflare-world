# Workflow DevKit Import Resolution Issue

## Problem Statement

Workflow DevKit fails to properly resolve module imports across different framework integrations, specifically when:

1. **Using framework-specific aliases** (Nuxt's `@@/`, Next.js's `@/`, etc.)
2. **Importing from directories outside the main workflows folder**
3. **Importing TypeScript files that aren't properly bundled**

This results in runtime errors like:
- `Unknown file extension ".ts" for /path/to/file.ts`
- `Could not resolve "alias/path"`
- Failed workflow execution due to missing modules

## Reproducible Examples

### Example 1: Nuxt Integration Issue

**Reported by**: @mikkokut in GitHub issue

**Project Structure**:
```
nuxt-project/
├── workflows/
│   └── test.ts
├── server/
│   └── utils/
│       └── say.ts
├── nuxt.config.ts
└── tsconfig.json
```

**workflows/test.ts**:
```typescript
import say from "../server/utils/say"; // Relative import - FAILS
// OR
import say from "@@/server/utils/say"; // Nuxt alias - FAILS

async function sayHello() {
    "use step";
    return { id: crypto.randomUUID(), message: say() };
}

export async function test() {
    "use workflow";
    const greeting = await sayHello();
    return greeting;
}
```

**server/utils/say.ts**:
```typescript
export default function say() {
    return "Hello from server utils";
}
```

**Error 1 - Relative Import**:
```
Unknown file extension ".ts" for /code/research/workflow-nuxt/server/utils/say.ts
```

**Error 2 - Alias Import**:
```
ERROR: Could not resolve "@@/server/utils/say"
```

### Example 2: Nitro Integration Issue

**Project Structure**:
```
nitro-app/
├── workflows/
│   └── test.ts
├── lib/
│   └── helpers.ts
├── nitro.config.ts
└── tsconfig.json
```

**workflows/test.ts**:
```typescript
import say from "../lib/helpers"; // FAILS

async function sayHello() {
    "use step";
    return { id: crypto.randomUUID(), message: say() };
}

export async function test() {
    "use workflow";
    const greeting = await sayHello();
    return greeting;
}
```

**lib/helpers.ts**:
```typescript
export default function say() {
    return "Hello from Helpers through step and workflow";
}
```

**Error**:
```
Unknown file extension ".ts" for /Users/eers/node/nitro-workflow-sample/lib/helpers.ts
```

## Root Cause Analysis

### 1. Module Resolution Disconnect

**Current Workflow DevKit Architecture**:
```
Framework (Nuxt/Next.js) → Module Resolution → Build Process
                                ↓
                         Workflow DevKit → Own Module Resolution → SWC Plugin → Build Process
```

**Problem**: Workflow DevKit runs its own module resolution system that's disconnected from the framework's resolver. This means:
- Framework aliases aren't recognized
- Framework-specific path mappings are ignored
- Different resolution strategies lead to conflicts

### 2. Build-Time vs Runtime Resolution

**Expected Flow**:
1. Build time: TypeScript files are compiled and bundled into JavaScript
2. Runtime: JavaScript bundles import from bundled versions

**Actual Problematic Flow**:
1. Build time: Some files aren't included in bundles due to resolution issues
2. Runtime: Attempts to import raw TypeScript files directly
3. Node.js ES Module loader rejects `.ts` extensions

### 3. SWC Plugin Resolution Limitations

**File**: `packages/builders/src/swc-esbuild-plugin.ts`

**Current Issues**:
- Only reads `tsconfig.json` paths mappings
- Doesn't integrate with framework alias systems
- Uses `enhanced-resolve` with limited configuration
- No framework-specific handling

### 4. Build Process Gaps

**Files**:
- `packages/builders/src/base-builder.ts:44-87`
- `packages/nitro/src/index.ts:16-18`
- `packages/nitro/src/builders.ts:33-71`

**Current Issues**:
- Only scans configured workflow directories
- Doesn't discover imported files outside these directories
- No mechanism to include external dependencies in bundles

## Files Requiring Changes

### Core Build System
1. **`packages/builders/src/base-builder.ts`**
   - `getTsConfigOptions()` method (lines 44-87)
   - `createStepsBundle()` method (lines 256-395)
   - `createWorkflowsBundle()` method (lines 403-608)

2. **`packages/builders/src/swc-esbuild-plugin.ts`**
   - `createSwcPlugin()` function (lines 49-248)
   - Enhanced resolve configuration (lines 24-47)
   - Module resolution logic (lines 70-127)

### Framework Integrations
3. **`packages/nitro/src/index.ts`**
   - Nitro module setup (lines 9-57)
   - Hook configuration (lines 16-18)

4. **`packages/nitro/src/builders.ts`**
   - Local builder implementation (lines 33-71)
   - Directory discovery (lines 73-85)

### Runtime Components
5. **`packages/core/src/workflow.ts`**
   - VM execution context (lines 540-543)
   - Module loading in sandbox

## Proposed Solution

### Approach 1: Enhanced Module Resolution (Immediate Fix)

**Concept**: Improve the existing enhanced-resolve configuration to better handle framework aliases and TypeScript extensions.

**Implementation**:
1. **Enhanced Resolver Configuration**
```typescript
const ENHANCED_RESOLVE_OPTIONS = {
  ...NODE_RESOLVE_OPTIONS,
  extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  alias: {
    '@': cwd,
    '@@': path.join(cwd, 'server'),
    '~': cwd,
    '~~': cwd,
  },
  // Add framework-specific alias patterns
  plugins: [
    // Framework alias resolution plugins
  ]
};
```

2. **Framework Alias Detection**
   - Detect framework type (Nuxt, Next.js, etc.)
   - Apply default aliases for each framework
   - Merge with user-configured aliases

3. **Improved TypeScript Extension Handling**
   - Always prefer `.ts` extensions during build
   - Ensure all imported files are included in bundles
   - Strip extensions in runtime imports

**Pros**:
- Minimal code changes
- Solves 80% of issues quickly
- Maintains backward compatibility

**Cons**:
- Still requires maintenance for new frameworks
- Limited to known alias patterns

### Approach 2: Framework Integration (Full Solution)

**Concept**: Hook into each framework's existing module resolution system instead of maintaining a separate one.

**Implementation Architecture**:
```typescript
interface FrameworkResolver {
  resolve(importPath: string, fromDir: string): Promise<string>;
  getAliases(): Record<string, string>;
  isSupported(): boolean;
}

class NuxtResolver implements FrameworkResolver {
  async resolve(importPath: string, fromDir: string): Promise<string> {
    // Hook into Vite's resolver used by Nuxt
    return this.viteResolver.resolveId(importPath, fromDir);
  }

  getAliases(): Record<string, string> {
    // Extract aliases from Nuxt config at runtime
    return this.extractNuxtAliases();
  }
}

class NextjsResolver implements FrameworkResolver {
  async resolve(importPath: string, fromDir: string): Promise<string> {
    // Hook into Next.js webpack resolver
    return this.webpackResolver.resolve(importPath, fromDir);
  }
}
```

**Implementation Steps**:
1. **Framework Detection**
```typescript
function detectFramework(cwd: string): FrameworkResolver | null {
  if (existsSync(path.join(cwd, 'nuxt.config.ts'))) {
    return new NuxtResolver(cwd);
  }
  if (existsSync(path.join(cwd, 'next.config.js'))) {
    return new NextjsResolver(cwd);
  }
  // ... other frameworks
  return null;
}
```

2. **Integration Points**
   - **Nuxt**: Hook into Nitro's build process
   - **Next.js**: Integrate with webpack compilation
   - **Vite**: Create Vite plugin for pre-resolution

3. **Enhanced SWC Plugin**
```typescript
build.onResolve({ filter: /.*/ }, async (args) => {
  if (frameworkResolver) {
    const resolvedPath = await frameworkResolver.resolve(args.path, args.resolveDir);
    // Use framework-resolved path instead of custom resolution
  }
});
```

**Pros**:
- Zero maintenance for new framework versions
- Always accurate (uses same resolver as framework)
- Supports all framework features automatically
- Future-proof for new frameworks

**Cons**:
- Larger implementation effort
- Requires framework-specific code
- More complex testing requirements

### Approach 3: Hybrid Solution (Recommended)

**Phase 1**: Implement Approach 1 (Enhanced Resolution) for immediate relief
**Phase 2**: Gradually migrate to Approach 2 (Framework Integration) for long-term robustness

**Implementation Timeline**:
1. **Week 1**: Implement enhanced resolver configuration
2. **Week 2**: Add framework alias detection
3. **Week 3**: Create framework resolver interfaces
4. **Week 4**: Implement Nuxt and Next.js resolvers
5. **Week 5**: Add Vite and SvelteKit support

## Testing Strategy

### Test Cases to Add
1. **Framework Alias Resolution**
   - Nuxt: `@@/server/utils`, `@/components`, `~/lib`
   - Next.js: `@/components`, `@/lib`
   - SvelteKit: `$lib`, `$components`

2. **Cross-Directory Imports**
   - Relative imports outside workflows directory
   - Absolute imports to project root
   - Mixed alias and relative imports

3. **TypeScript Extension Handling**
   - Direct `.ts` imports
   - Implicit resolution (no extension)
   - Mixed `.js`/`.ts` imports

### Test Projects to Create
1. `test-imports/nuxt-alias-test`
2. `test-imports/nextjs-alias-test`
3. `test-imports/vite-alias-test`
4. `test-imports/cross-directory-test`

## Migration Path

### For Users
1. **Immediate**: Use path aliases in `tsconfig.json` as workaround
2. **Short-term**: Configure workflow directories to include all import sources
3. **Long-term**: No changes required - framework aliases work automatically

### Backward Compatibility
- All existing configurations continue to work
- Gradual enhancement of existing functionality
- No breaking changes to APIs

## Success Criteria

1. **All Framework Aliases Work**: Nuxt `@@/`, Next.js `@/`, etc.
2. **Cross-Directory Imports**: Import from anywhere in project
3. **TypeScript Extension Handling**: No runtime `.ts` extension errors
4. **Zero Configuration**: Works out of the box for common setups
5. **Framework Agnostic**: Supports any framework with resolver API

## Related Issues

- GitHub Issue: #261 - "Cannot use shared typescript utility files in workflows/steps when using Nuxt"
- Multiple user reports of TypeScript extension errors
- Framework integration compatibility issues