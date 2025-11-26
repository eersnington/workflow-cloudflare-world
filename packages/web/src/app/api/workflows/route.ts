import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseStepName, parseWorkflowName } from '@workflow/core/parse-name';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type WorkflowManifestV2 = {
  version: 2;
  workflows: {
    id: string;
    name: string;
    file: string;
    steps: {
      id: string;
      name: string;
      file: string;
      order: number;
    }[];
  }[];
};

export type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
  type: 'workflow' | 'step';
};

const MANIFEST_DIRS = ['', '.well-known/workflow/v1'];
const MANIFEST_FILES = ['manifest.v2.json'];
const KNOWN_DATA_DIR_SUFFIXES = [
  '.next/workflow-data',
  '.workflow-data',
  'workflow-data',
];

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

type Framework =
  | 'next'
  | 'sveltekit'
  | 'nitro'
  | 'nuxt'
  | 'generic'
  | 'unknown';

async function detectFramework(baseDir: string): Promise<Framework> {
  try {
    const pkg = JSON.parse(
      await readFile(join(baseDir, 'package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps?.next) return 'next';
    if (deps?.['@sveltejs/kit']) return 'sveltekit';
    if (deps?.nitropack || deps?.nitro) return 'nitro';
    if (deps?.nuxt) return 'nuxt';
    if (deps?.express || deps?.vite || deps?.hono) return 'generic';
  } catch {
    // ignore
  }
  return 'unknown';
}

function frameworkDataDirs(
  framework: Framework | 'sveltekit' | 'nitro' | 'nuxt' | 'generic'
) {
  switch (framework) {
    case 'next':
      return ['.next/workflow-data', '.next/.workflow-data'];
    case 'sveltekit':
      return ['.svelte-kit/workflow-data'];
    case 'nitro':
      return ['.nitro/workflow-data'];
    case 'nuxt':
      return ['.nuxt/workflow-data', '.output/workflow-data'];
    case 'generic':
    case 'unknown':
    default:
      return [];
  }
}

async function deriveRoots(paramDataDir?: string | null): Promise<string[]> {
  const roots = new Set<string>();

  const manifestPath = process.env.WORKFLOW_MANIFEST_PATH;
  if (manifestPath) {
    roots.add(dirname(manifestPath));
  }

  const projectRoot = process.env.WORKFLOW_PROJECT_ROOT;
  if (projectRoot) {
    roots.add(resolve(projectRoot));
  }

  const dataDir = paramDataDir || process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  if (dataDir) {
    const resolved = resolve(dataDir);
    roots.add(resolved);
    roots.add(dirname(resolved));
    roots.add(resolve(resolved, '..', '..'));
  }

  // Walk upward from the execution cwd and add framework-specific + generic data dirs per level
  let current = resolve(process.cwd());
  const visitedLevels: string[] = [];
  for (let i = 0; i < 5; i++) {
    roots.add(current);
    visitedLevels.push(current);

    const framework = await detectFramework(current);
    for (const suffix of frameworkDataDirs(framework)) {
      roots.add(join(current, suffix));
    }
    for (const suffix of KNOWN_DATA_DIR_SUFFIXES) {
      roots.add(join(current, suffix));
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Workspace-aware shallow scan: look one level under the top-most visited root
  const topRoot = visitedLevels.at(-1);
  if (topRoot) {
    try {
      const entries = await readdir(topRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const base = join(topRoot, entry.name);
        // Add generic data dir candidates
        for (const suffix of KNOWN_DATA_DIR_SUFFIXES) {
          roots.add(join(base, suffix));
        }
        // Add framework-specific candidates based on that workspace's package.json (best effort)
        const framework = await detectFramework(base);
        for (const suffix of frameworkDataDirs(framework)) {
          roots.add(join(base, suffix));
        }
      }
    } catch {
      // best-effort
    }
  }

  return Array.from(roots);
}

async function findManifest(dataDir?: string | null): Promise<{
  path: string;
  manifest: WorkflowManifestV2;
} | null> {
  const roots = await deriveRoots(dataDir);
  const subdirs = ['', 'flow', 'step'];

  const foundManifests: { manifest: WorkflowManifestV2; path: string }[] = [];

  for (const root of roots) {
    for (const manifestDir of MANIFEST_DIRS) {
      for (const subdir of subdirs) {
        for (const file of MANIFEST_FILES) {
          const fullPath = join(root, manifestDir, subdir, file);
          console.log(`Checking manifest path: ${fullPath}`);
          if (await fileExists(fullPath)) {
            try {
              const content = await readFile(fullPath, 'utf8');
              const manifest = JSON.parse(content) as WorkflowManifestV2;
              if (manifest.version === 2) {
                foundManifests.push({ manifest, path: fullPath });
              }
            } catch (error) {
              console.error(
                `Failed to read workflow manifest at ${fullPath}`,
                error
              );
            }
          }
        }
      }
    }
  }

  if (foundManifests.length === 0) {
    return null;
  }

  return {
    path: foundManifests[foundManifests.length - 1].path,
    manifest: foundManifests[foundManifests.length - 1].manifest,
  };
}

function normalizeManifest(manifest: WorkflowManifestV2): WorkflowListItem[] {
  return manifest.workflows.flatMap((wf) => [
    {
      id: wf.id,
      name: wf.name,
      file: wf.file,
      type: 'workflow' as const,
    },
    ...wf.steps.map((s) => ({
      id: s.id,
      name: s.name,
      file: s.file,
      type: 'step' as const,
    })),
  ]);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataDir = searchParams.get('dataDir');

  const located = await findManifest(dataDir);

  if (!located) {
    return NextResponse.json(
      {
        workflows: [],
        error:
          'No workflow manifest found. Run `workflow build` to generate `.well-known/workflow/v1/manifest.json`.',
      },
      { status: 200 }
    );
  }

  const workflows = normalizeManifest(located.manifest);

  return NextResponse.json(
    {
      workflows,
      manifestPath: located.path,
    },
    { status: 200 }
  );
}
