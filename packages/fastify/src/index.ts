import { relative } from 'node:path';
import { transform } from '@swc/core';
import { resolveModulePath } from 'exsolve';
import type { Plugin, HotUpdateOptions } from 'vite';
import { FastifyBuilder } from './builder.js';

export default function workflowPlugin(): Plugin {
  let builder: FastifyBuilder;

  return {
    name: 'workflow:fastify',

    async transform(code: string, id: string) {
      if (!code.match(/(use step|use workflow)/)) {
        return null;
      }

      const isTypeScript = id.endsWith('.ts') || id.endsWith('.tsx');
      const swcPlugin = resolveModulePath('@workflow/swc-plugin', {
        from: [import.meta.url],
      });

      const workingDir = process.cwd().replace(/\\/g, '/');
      const normalizedId = id.replace(/\\/g, '/');

      let relativeFilename = relative(workingDir, normalizedId).replace(
        /\\/g,
        '/'
      );
      if (relativeFilename.startsWith('..')) {
        relativeFilename = normalizedId.split('/').pop() || 'unknown.ts';
      }

      const result = await transform(code, {
        filename: relativeFilename,
        jsc: {
          parser: {
            syntax: isTypeScript ? 'typescript' : 'ecmascript',
            tsx: id.endsWith('.tsx'),
          },
          target: 'es2022',
          experimental: {
            plugins: [[swcPlugin, { mode: 'client' }]],
          },
        },
        minify: false,
        sourceMaps: true,
        inlineSourcesContent: true,
      });

      return {
        code: result.code,
        map: result.map ? JSON.parse(result.map) : null,
      };
    },

    configResolved() {
      builder = new FastifyBuilder();
      // Initial build
      builder.build().catch((err) => {
        console.error('[workflow] Initial build failed:', err);
      });
    },

    async hotUpdate(options: HotUpdateOptions) {
      const { file, server, read } = options;
      const jsTsRegex = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

      if (!jsTsRegex.test(file)) return;

      let content: string;
      try {
        content = await read();
      } catch {
        // File deleted
        builder.build().catch(console.error);
        return;
      }

      if (content.includes('use workflow') || content.includes('use step')) {
        await builder.build();
        server.ws.send({ type: 'full-reload' });
      }
    },
  };
}
