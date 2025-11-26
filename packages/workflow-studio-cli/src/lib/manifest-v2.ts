import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import pc from 'picocolors';
import { log } from '@clack/prompts';

type Position = { line: number; column: number };
type Range = { start: Position; end: Position };

export type ManifestStep = {
  id: string;
  name: string;
  file: string;
  range: Range;
  order: number;
};

export type ManifestWorkflow = {
  id: string;
  name: string;
  file: string;
  range: Range;
  steps: ManifestStep[];
};

export type ManifestV2 = {
  version: 2;
  generatedAt: string;
  workflows: ManifestWorkflow[];
};

type FunctionMeta = {
  name: string;
  file: string;
  range: Range;
  symbol: ts.Symbol;
};

const USE_WORKFLOW = 'use workflow';
const USE_STEP = 'use step';

function hasDirective(block: ts.Block | undefined, directive: string): boolean {
  if (!block || block.statements.length === 0) return false;
  const first = block.statements[0];
  return (
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === directive
  );
}

function toPos(sf: ts.SourceFile, pos: number): Position {
  const lc = sf.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function toRange(node: ts.Node): Range {
  const sf = node.getSourceFile();
  return {
    start: toPos(sf, node.getStart()),
    end: toPos(sf, node.getEnd()),
  };
}

function normalizePath(baseDir: string, filePath: string): string {
  const rel = relative(baseDir, filePath).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function workflowId(baseDir: string, meta: FunctionMeta) {
  const rel = normalizePath(baseDir, meta.file);
  return `workflow//${rel}//${meta.name}`;
}

function stepId(baseDir: string, meta: FunctionMeta) {
  const rel = normalizePath(baseDir, meta.file);
  return `step//${rel}//${meta.name}`;
}

function getName(node: ts.FunctionLikeDeclarationBase): string | undefined {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  // Arrow/function expression assigned to const/let
  if (
    node.parent &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return undefined;
}

function collectFunctions(
  sf: ts.SourceFile,
  checker: ts.TypeChecker,
  kind: 'workflow' | 'step'
): Map<ts.Symbol, FunctionMeta> {
  const map = new Map<ts.Symbol, FunctionMeta>();

  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)) &&
      node.body
    ) {
      const expectedDirective = kind === 'workflow' ? USE_WORKFLOW : USE_STEP;
      if (
        !ts.isBlock(node.body) ||
        !hasDirective(node.body, expectedDirective)
      ) {
        return;
      }

      const name = getName(node);
      if (!name) return;
      const symbol = checker.getSymbolAtLocation(
        node.name ?? (node.parent && (node.parent as any).name)
      );
      if (!symbol) return;

      const file = sf.fileName;
      map.set(symbol, {
        name,
        file,
        range: toRange(node),
        symbol,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return map;
}

function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol) {
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }
  return symbol;
}

function collectWorkflowSteps(
  workflow: FunctionMeta,
  checker: ts.TypeChecker,
  stepMap: Map<ts.Symbol, FunctionMeta>,
  baseDir: string
): ManifestStep[] {
  const steps: ManifestStep[] = [];
  let order = 1;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const sym = checker.getSymbolAtLocation(node.expression);
      if (sym) {
        const resolved = resolveAliasedSymbol(checker, sym);
        const stepMeta = stepMap.get(resolved);
        if (stepMeta) {
          steps.push({
            id: stepId(baseDir, stepMeta),
            name: stepMeta.name,
            file: normalizePath(baseDir, stepMeta.file),
            range: stepMeta.range,
            order: order++,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  const body = (
    workflow.symbol.valueDeclaration as ts.FunctionLikeDeclarationBase
  )?.body;
  if (body) {
    visit(body);
  }

  return steps;
}

function findTsconfig(cwd: string): string | undefined {
  return (
    ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json') ||
    ts.findConfigFile(cwd, ts.sys.fileExists, 'jsconfig.json')
  );
}

function createProgram(cwd: string): ts.Program {
  const configPath = findTsconfig(cwd);
  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(configPath),
      { allowJs: true, jsx: ts.JsxEmit.ReactJSX },
      configPath
    );
    return ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
  }

  // Fallback: include common source files in cwd
  const files = ts.sys.readDirectory(
    cwd,
    ['.ts', '.tsx', '.js', '.jsx'],
    [
      'node_modules',
      '.next',
      '.svelte-kit',
      '.workflow-data',
      '.git',
      'dist',
      'build',
    ]
  );

  return ts.createProgram({
    rootNames: files,
    options: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
}

async function resolveDataDir(workingDir: string): Promise<string> {
  const fromEnv = process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(workingDir, fromEnv);
  }

  const candidates = [
    '.next/workflow-data',
    '.svelte-kit/workflow-data',
    '.workflow-data',
    'workflow-data',
  ];

  for (const candidate of candidates) {
    const full = resolve(workingDir, candidate);
    try {
      await access(full);
      return full;
    } catch {
      // not found, keep searching
    }
  }

  // Fallback: create a local .workflow-data if nothing exists
  const fallback = resolve(workingDir, '.workflow-data');
  await mkdir(fallback, { recursive: true });
  return fallback;
}

export async function generateManifestV2(
  workingDir: string
): Promise<string | null> {
  try {
    const program = createProgram(workingDir);
    const checker = program.getTypeChecker();

    const stepMap = new Map<ts.Symbol, FunctionMeta>();
    const workflows: ManifestWorkflow[] = [];

    for (const sf of program.getSourceFiles()) {
      if (sf.isDeclarationFile || !sf.fileName.startsWith(workingDir)) continue;
      const stepsInFile = collectFunctions(sf, checker, 'step');
      stepsInFile.forEach((meta, sym) => stepMap.set(sym, meta));
    }

    for (const sf of program.getSourceFiles()) {
      if (sf.isDeclarationFile || !sf.fileName.startsWith(workingDir)) continue;
      const workflowsInFile = collectFunctions(sf, checker, 'workflow');
      workflowsInFile.forEach((meta) => {
        const steps = collectWorkflowSteps(meta, checker, stepMap, workingDir);
        workflows.push({
          id: workflowId(workingDir, meta),
          name: meta.name,
          file: normalizePath(workingDir, meta.file),
          range: meta.range,
          steps,
        });
      });
    }

    const manifest: ManifestV2 = {
      version: 2,
      generatedAt: new Date().toISOString(),
      workflows,
    };

    const dataDir = await resolveDataDir(workingDir);
    const manifestPath = join(dataDir, 'manifest.v2.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifestPath;
  } catch (error) {
    log.warn(
      pc.yellow(
        `Unable to generate v2 workflow manifest: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return null;
  }
}
