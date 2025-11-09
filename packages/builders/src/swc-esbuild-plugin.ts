import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import enhancedResolveOrig from 'enhanced-resolve';
import type { Plugin } from 'esbuild';
import {
  applySwcTransform,
  type WorkflowManifest,
} from './apply-swc-transform.js';
import {
  jsTsRegex,
  parentHasChild,
} from './discover-entries-esbuild-plugin.js';

export interface SwcPluginOptions {
  mode: 'step' | 'workflow' | 'client';
  entriesToBundle?: string[];
  outdir?: string;
  tsPaths?: Record<string, string[]>;
  tsBaseUrl?: string;
  workflowManifest?: WorkflowManifest;
}

const NODE_RESOLVE_OPTIONS = {
  dependencyType: 'commonjs',
  modules: ['node_modules'],
  exportsFields: ['exports'],
  importsFields: ['imports'],
  conditionNames: ['node', 'require'],
  descriptionFiles: ['package.json'],
  extensions: ['.ts', '.mts', '.cjs', '.js', '.json', '.node'],
  enforceExtensions: false,
  symlinks: true,
  mainFields: ['main'],
  mainFiles: ['index'],
  roots: [],
  fullySpecified: false,
  preferRelative: false,
  preferAbsolute: false,
  restrictions: [],
};

const NODE_ESM_RESOLVE_OPTIONS = {
  ...NODE_RESOLVE_OPTIONS,
  dependencyType: 'esm',
  conditionNames: ['node', 'import'],
};

export function createSwcPlugin(options: SwcPluginOptions): Plugin {
  return {
    name: 'swc-workflow-plugin',
    setup(build) {
      const workingDir = build.initialOptions.absWorkingDir || process.cwd();
      const resolveTsSpecifier =
        options.tsPaths && options.tsBaseUrl
          ? createTsPathResolver(options.tsPaths, options.tsBaseUrl)
          : undefined;

      // everything is external unless explicitly configured
      // to be bundled
      const cjsResolver = promisify(
        enhancedResolveOrig.create(NODE_RESOLVE_OPTIONS)
      );
      const esmResolver = promisify(
        enhancedResolveOrig.create(NODE_ESM_RESOLVE_OPTIONS)
      );

      const enhancedResolve = async (context: string, path: string) => {
        try {
          return await esmResolver(context, path);
        } catch (_) {
          return cjsResolver(context, path);
        }
      };

      build.onResolve({ filter: /.*/ }, async (args) => {
        if (!options.entriesToBundle) {
          return null;
        }

        try {
          const requestPath = resolveTsSpecifier?.(args.path) ?? args.path;
          let resolvedPath: string | false | undefined = requestPath;

          if (isAbsolute(requestPath) || requestPath.startsWith('.')) {
            const context = isAbsolute(requestPath)
              ? workingDir
              : args.resolveDir;
            resolvedPath = await enhancedResolve(context, requestPath);
          } else {
            resolvedPath = await enhancedResolve(
              // `args.resolveDir` is not used here to ensure we only
              // externalize packages that can be resolved in the
              // project's working directory e.g. a nested dep can't
              // be externalized as we won't be able to resolve it once
              // it's parent has been bundled
              workingDir,
              requestPath
            );
          }

          if (!resolvedPath) return null;

          // Normalize to forward slashes for cross-platform comparison
          const normalizedResolvedPath = resolvedPath.replace(/\\/g, '/');
          const isNodeModule =
            normalizedResolvedPath.includes('/node_modules/');

          for (const entryToBundle of options.entriesToBundle) {
            const normalizedEntry = entryToBundle.replace(/\\/g, '/');

            if (normalizedResolvedPath === normalizedEntry) {
              return null;
            }

            // if the current entry imports a child that needs
            // to be bundled then it needs to also be bundled so
            // that the child can have our transform applied
            if (parentHasChild(normalizedResolvedPath, normalizedEntry)) {
              return null;
            }
          }

          if (!isNodeModule) {
            // Bundle any project-local helper
            return null;
          }

          const isFilePath =
            requestPath.startsWith('.') || requestPath.startsWith('/');

          return {
            external: true,
            path: isFilePath
              ? relative(options.outdir || process.cwd(), resolvedPath).replace(
                  /\\/g,
                  '/'
                )
              : requestPath,
          };
        } catch (_) {}
        return null;
      });

      // Handle TypeScript and JavaScript files
      build.onLoad({ filter: jsTsRegex }, async (args) => {
        // Determine if this is a TypeScript file
        const isTypeScript =
          args.path.endsWith('.ts') || args.path.endsWith('.tsx');

        try {
          // Determine the loader based on the output
          let loader: 'js' | 'jsx' = 'js';
          if (!isTypeScript && args.path.endsWith('.jsx')) {
            loader = 'jsx';
          }
          const source = await readFile(args.path, 'utf8');

          // Calculate relative path for SWC plugin
          // The filename parameter is used to generate workflowId/stepId, so it must be relative
          const workingDir =
            build.initialOptions.absWorkingDir || process.cwd();
          // Normalize paths: convert backslashes to forward slashes and remove trailing slashes
          const normalizedWorkingDir = workingDir
            .replace(/\\/g, '/')
            .replace(/\/$/, '');
          const normalizedPath = args.path.replace(/\\/g, '/');

          // Windows fix: Always do case-insensitive path comparison as the PRIMARY logic
          // to work around node:path.relative() not recognizing paths with different drive
          // letter casing (e.g., D: vs d:) as being in the same tree
          const lowerWd = normalizedWorkingDir.toLowerCase();
          const lowerPath = normalizedPath.toLowerCase();

          let relativeFilepath: string;
          if (lowerPath.startsWith(lowerWd + '/')) {
            // File is under working directory - manually calculate relative path
            // This ensures we get a relative path even with drive letter casing issues
            relativeFilepath = normalizedPath.substring(
              normalizedWorkingDir.length + 1
            );
          } else if (lowerPath === lowerWd) {
            // File IS the working directory
            relativeFilepath = '.';
          } else {
            // File is outside working directory - use relative() and strip ../ prefixes if needed
            relativeFilepath = relative(
              normalizedWorkingDir,
              normalizedPath
            ).replace(/\\/g, '/');

            // Handle files discovered outside the working directory
            // These come back as ../path/to/file, but we want just path/to/file
            if (relativeFilepath.startsWith('../')) {
              relativeFilepath = relativeFilepath
                .split('/')
                .filter((part) => part !== '..')
                .join('/');
            }
          }

          // Final safety check - ensure we never pass an absolute path to SWC
          if (
            relativeFilepath.includes(':') ||
            relativeFilepath.startsWith('/')
          ) {
            // This should never happen, but if it does, use just the filename as last resort
            console.error(
              `[ERROR] relativeFilepath is still absolute: ${relativeFilepath}`
            );
            relativeFilepath = normalizedPath.split('/').pop() || 'unknown.ts';
          }

          const { code: transformedCode, workflowManifest } =
            await applySwcTransform(
              relativeFilepath,
              source,
              options.mode,
              // we need to provide the tsconfig/jsconfig
              // alias via swc so that we can resolve them
              // with our custom resolve logic
              {
                paths: options.tsPaths,
                baseUrl: options.tsBaseUrl,
              }
            );

          if (!options.workflowManifest) {
            options.workflowManifest = {};
          }

          options.workflowManifest.workflows = Object.assign(
            options.workflowManifest.workflows || {},
            workflowManifest.workflows
          );
          options.workflowManifest.steps = Object.assign(
            options.workflowManifest.steps || {},
            workflowManifest.steps
          );

          return {
            contents: transformedCode,
            loader,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `❌ SWC transform error in ${args.path}:`,
            errorMessage
          );
          return {
            errors: [
              {
                text: `SWC transform failed: ${errorMessage}`,
                location: { file: args.path, line: 0, column: 0 },
              },
            ],
          };
        }
      });
    },
  };
}

type TsPathResolver = (specifier: string) => string | null;

function createTsPathResolver(
  tsPaths: Record<string, string[]>,
  baseUrl: string
): TsPathResolver {
  const entries = Object.entries(tsPaths)
    .map(([pattern, replacements]) => {
      if (!replacements || replacements.length === 0) {
        return null;
      }

      const wildcardIndex = pattern.indexOf('*');
      const hasWildcard = wildcardIndex !== -1;
      const prefix = hasWildcard ? pattern.slice(0, wildcardIndex) : pattern;
      const suffix = hasWildcard ? pattern.slice(wildcardIndex + 1) : '';

      const normalizedReplacements = replacements
        .map((replacement) => {
          if (!replacement) return null;
          const replacementWildcardIndex = replacement.indexOf('*');
          const replacementHasWildcard = replacementWildcardIndex !== -1;
          const replacementPrefix = replacementHasWildcard
            ? replacement.slice(0, replacementWildcardIndex)
            : replacement;
          const replacementSuffix = replacementHasWildcard
            ? replacement.slice(replacementWildcardIndex + 1)
            : '';
          return {
            replacementHasWildcard,
            replacementPrefix,
            replacementSuffix,
          };
        })
        .filter(
          (
            replacement
          ): replacement is {
            replacementHasWildcard: boolean;
            replacementPrefix: string;
            replacementSuffix: string;
          } => !!replacement && !!replacement.replacementPrefix
        );

      if (normalizedReplacements.length === 0) {
        return null;
      }

      return {
        hasWildcard,
        prefix,
        suffix,
        replacements: normalizedReplacements,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        hasWildcard: boolean;
        prefix: string;
        suffix: string;
        replacements: {
          replacementHasWildcard: boolean;
          replacementPrefix: string;
          replacementSuffix: string;
        }[];
      } => !!entry
    );

  return (specifier) => {
    for (const entry of entries) {
      if (entry.hasWildcard) {
        if (!specifier.startsWith(entry.prefix)) continue;
        if (entry.suffix && !specifier.endsWith(entry.suffix)) continue;

        const endIndex = entry.suffix
          ? specifier.length - entry.suffix.length
          : specifier.length;
        const wildcardValue = specifier.slice(entry.prefix.length, endIndex);

        for (const replacement of entry.replacements) {
          const candidateRelative = replacement.replacementHasWildcard
            ? `${replacement.replacementPrefix}${wildcardValue}${replacement.replacementSuffix}`
            : replacement.replacementPrefix;
          const absoluteCandidate = isAbsolute(candidateRelative)
            ? candidateRelative
            : resolve(baseUrl, candidateRelative);
          return absoluteCandidate;
        }
      } else if (specifier === entry.prefix) {
        for (const replacement of entry.replacements) {
          const candidateRelative = replacement.replacementHasWildcard
            ? `${replacement.replacementPrefix}${replacement.replacementSuffix}`
            : replacement.replacementPrefix;
          const absoluteCandidate = isAbsolute(candidateRelative)
            ? candidateRelative
            : resolve(baseUrl, candidateRelative);
          return absoluteCandidate;
        }
      }
    }

    return null;
  };
}
