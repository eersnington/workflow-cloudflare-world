import type { CodemodDefinition } from './types.js';

const honoRouteContent = `import { Hono } from 'hono';
import { start } from 'workflow/api';
import { handleUserSignup } from '../workflows/example.js';

const app = new Hono();

app.post('/api/signup', async (c) => {
  const { email } = await c.req.json();
  await start(handleUserSignup, [email]);
  return c.json({ message: 'User signup workflow started' });
});

export default app;
`;

const honoWorkflowContent = `import { workflow } from '@workflow/core';

export const example = workflow({
  name: 'example-hono',
  run: async ({ step }) => {
    const greeting = await step('greet', async () => {
      return 'Hello from Workflow Studio';
    });
    return greeting;
  },
});
`;

const honoRouteCodemod: CodemodDefinition = {
  globs: ['src/index.ts'],
  transform(source) {
    if (!source.includes('Hello Hono')) {
      return null;
    }
    return honoRouteContent;
  },
};

const honoWorkflowCodemod: CodemodDefinition = {
  globs: ['workflows/example.ts'],
  transform(source) {
    if (!source.includes('__WORKFLOW_HONO_MINIMAL__')) {
      return null;
    }
    return honoWorkflowContent;
  },
};

const honoTsconfigCodemod: CodemodDefinition = {
  globs: ['tsconfig.json'],
  transform(source) {
    const parsed = parseJsonWithComments(source);
    if (!parsed) {
      return null;
    }
    parsed.compilerOptions ??= {};
    const compilerOptions = parsed.compilerOptions as Record<string, unknown>;
    const plugins = Array.isArray(compilerOptions.plugins)
      ? (compilerOptions.plugins as Record<string, unknown>[])
      : [];

    if (
      plugins.some(
        (plugin) =>
          plugin && typeof plugin === 'object' && plugin.name === 'workflow'
      )
    ) {
      return null;
    }

    const normalized = plugins.filter(
      (plugin): plugin is Record<string, unknown> =>
        Boolean(plugin && typeof plugin === 'object')
    );
    normalized.push({ name: 'workflow' });
    compilerOptions.plugins = normalized;

    return `${JSON.stringify(parsed, null, 2)}\n`;
  },
};

const honoPackageScriptsCodemod: CodemodDefinition = {
  globs: ['package.json'],
  transform(source) {
    let parsed: any;
    try {
      parsed = JSON.parse(source);
    } catch {
      return null;
    }

    parsed.scripts ??= {};
    const scripts = parsed.scripts as Record<string, string>;
    let mutated = false;

    if (scripts.dev !== 'nitro dev') {
      scripts.dev = 'nitro dev';
      mutated = true;
    }

    if (scripts.build !== 'nitro build') {
      scripts.build = 'nitro build';
      mutated = true;
    }

    return mutated ? `${JSON.stringify(parsed, null, 2)}\n` : null;
  },
};

function parseJsonWithComments(source: string): any | null {
  try {
    const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, '');
    return JSON.parse(withoutLineComments);
  } catch {
    return null;
  }
}

export const honoCodemods = {
  'hono/index/route': honoRouteCodemod,
  'hono/workflow': honoWorkflowCodemod,
  'hono/tsconfig/plugin': honoTsconfigCodemod,
  'hono/package/scripts': honoPackageScriptsCodemod,
} as const satisfies Record<string, CodemodDefinition>;
