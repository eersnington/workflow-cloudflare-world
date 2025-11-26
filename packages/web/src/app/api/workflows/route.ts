import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseStepName, parseWorkflowName } from '@workflow/core/parse-name';
import { NextResponse } from 'next/server';
import { generateManifestV2 } from '../../../../../workflow-studio-cli/src/lib/manifest-v2';

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

export const revalidate = 0;

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

async function fileMtimeMs(path: string): Promise<number | null> {
  try {
    const { mtimeMs } = await stat(path);
    return mtimeMs;
  } catch {
    return null;
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

const ALL_DATA_DIR_SUFFIXES = Array.from(
  new Set([
    ...KNOWN_DATA_DIR_SUFFIXES,
    ...frameworkDataDirs('next'),
    ...frameworkDataDirs('sveltekit'),
    ...frameworkDataDirs('nitro'),
    ...frameworkDataDirs('nuxt'),
  ])
).sort((a, b) => b.length - a.length);

function deriveWorkingDirFromRoot(root: string): string {
  for (const suffix of ALL_DATA_DIR_SUFFIXES) {
    if (root.endsWith(suffix)) {
      return root.slice(0, -suffix.length);
    }
  }
  return root;
}

async function regenerateManifest(workingDir: string): Promise<string | null> {
  try {
    return await generateManifestV2(workingDir);
  } catch (error) {
    console.error(`Failed to regenerate manifest for ${workingDir}`, error);
    return null;
  }
}

async function deriveRoots(paramDataDir?: string | null): Promise<string[]> {
  const roots = new Set<string>();

  if (paramDataDir) {
    const resolved = resolve(paramDataDir);
    roots.add(resolved);
    return Array.from(roots);
  }

  const manifestPath = process.env.WORKFLOW_MANIFEST_PATH;
  if (manifestPath) {
    roots.add(dirname(manifestPath));
  }

  const projectRoot = process.env.WORKFLOW_PROJECT_ROOT;
  if (projectRoot) {
    roots.add(resolve(projectRoot));
  }

  const dataDir = process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  if (dataDir) {
    const resolved = resolve(dataDir);
    roots.add(resolved);
    roots.add(dirname(resolved));
    roots.add(resolve(resolved, '..', '..'));
  }

  // Walk upward from the execution cwd and add framework-specific + generic data dirs per level
  let current = resolve(process.cwd());
  for (let i = 0; i < 5; i++) {
    roots.add(current);

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

  return Array.from(roots);
}

async function findManifest(dataDir?: string | null): Promise<{
  path: string;
  manifest: WorkflowManifestV2;
  stale: boolean;
} | null> {
  const roots = await deriveRoots(dataDir);
  const subdirs = dataDir ? [''] : ['', 'flow', 'step'];

  const found: {
    manifest: WorkflowManifestV2;
    path: string;
    stale: boolean;
    workingDirHint: string;
  }[] = [];

  for (const root of roots) {
    const workingDirHint = deriveWorkingDirFromRoot(root);
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
                const manifestMtime = await fileMtimeMs(fullPath);
                let stale = false;
                if (manifestMtime) {
                  const manifestRoot = resolve(fullPath, '..', '..');
                  const files = new Set<string>();
                  manifest.workflows.forEach((wf) => {
                    files.add(resolve(manifestRoot, wf.file));
                    wf.steps.forEach((s) =>
                      files.add(resolve(manifestRoot, s.file))
                    );
                  });
                  for (const f of files) {
                    const mtime = await fileMtimeMs(f);
                    if (mtime && mtime > manifestMtime + 5) {
                      stale = true;
                      break;
                    }
                  }
                }
                found.push({ manifest, path: fullPath, stale, workingDirHint });
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

  if (found.length === 0) {
    return null;
  }

  return found[found.length - 1];
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
  const forceBuild = searchParams.get('forceBuild') === '1';

  let located = await findManifest(dataDir);

  if (forceBuild && dataDir) {
    await regenerateManifest(deriveWorkingDirFromRoot(dataDir));
    located = await findManifest(dataDir);
  }

  if (!located) {
    return NextResponse.json(
      {
        workflows: [],
        error:
          'No workflow manifest found. Run `workflow build` to generate `.well-known/workflow/v1/manifest.json`.',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const workflows = normalizeManifest(located.manifest);

  return NextResponse.json(
    {
      workflows,
      manifestPath: located.path,
      error: located.stale
        ? 'Workflow manifest appears stale. Run `workflow build` (or watch) to regenerate.'
        : undefined,
      stale: located.stale,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
