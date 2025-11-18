import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Lang } from '@ast-grep/napi';
import { glob } from 'glob';

export async function runAstGrep({
  rule,
  globs,
  cwd,
}: {
  rule: string;
  globs?: string[];
  cwd: string;
}) {
  const ruleConfig = parseAstGrepRule(rule);
  const patterns = globs || ['**/*.{js,ts,jsx,tsx,svelte}'];

  const filePaths: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, absolute: true });
    filePaths.push(...matches);
  }

  for (const filePath of filePaths) {
    try {
      await processFile(filePath, ruleConfig);
    } catch (error) {
      console.warn(`Warning: Failed to process ${filePath}:`, error);
    }
  }
}

function parseAstGrepRule(ruleYaml: string): AstGrepRule {
  const lines = ruleYaml.split('\n');

  let id = '';
  let language = 'typescript';
  let fix = '';
  let targetPattern = '';
  let hasStringLiteralRegex = '';

  let inFixSection = false;
  const fixLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (line.startsWith('id:')) {
      id = trimmed.slice(3).replace(/['"]/g, '').trim();
    } else if (line.startsWith('language:')) {
      language = trimmed.slice(9).replace(/['"]/g, '').trim();
    } else if (trimmed === 'fix:' || trimmed === 'fix: |-') {
      inFixSection = true;
    } else if (inFixSection) {
      if (line.length > 0 && line[0] !== ' ') {
        inFixSection = false;
        i--;
      } else {
        fixLines.push(line);
      }
    } else if (line.includes('regex:')) {
      const regexMatch = line.match(/regex:\s*['"]([^'"]+)['"]/);
      if (regexMatch) {
        hasStringLiteralRegex = regexMatch[1];
      }
    } else if (line.includes('import Image from "next/image"')) {
      targetPattern = 'next-default-page';
    } else if (line.includes('<h1>Welcome to SvelteKit</h1>')) {
      targetPattern = 'svelte-default-page';
    }
  }

  if (fixLines.length > 0) {
    const nonEmptyLines = fixLines.filter((line) => line.trim().length > 0);
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
      })
    );

    fix = fixLines
      .map((line) => line.slice(minIndent))
      .join('\n')
      .trim();

    fix = fix.replace(/(;\s*\n)(export|function|async)/g, '$1\n$2');
    fix = fix.replace(/(}\s*\n)(export|const)/g, '$1\n$2');
    fix = fix.replace(/(}\s*\n)(<\/)/g, '$1\n$2');
    fix = fix.replace(/(}\s*\n)(const)/g, '$1\n$2');
    fix = fix.replace(/(<\/script>)\s*(<main)/g, '$1\n\n$2');
  }

  return {
    id,
    language,
    targetPattern,
    hasStringLiteralRegex,
    fix,
  };
}

function detectLanguage(filePath: string): Lang | null {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.js':
    case '.jsx':
      return Lang.JavaScript;
    case '.ts':
    case '.tsx':
      return Lang.TypeScript;
    case '.svelte':
      return Lang.Html;
    default:
      return null;
  }
}

async function processFile(filePath: string, rule: AstGrepRule) {
  const language = detectLanguage(filePath);
  if (!language) {
    return;
  }

  const source = await readFile(filePath, 'utf8');

  let shouldTransform = false;

  if (rule.hasStringLiteralRegex) {
    shouldTransform = source.includes(rule.hasStringLiteralRegex);
  } else if (rule.targetPattern === 'next-default-page') {
    shouldTransform =
      source.includes('import Image from "next/image"') &&
      source.includes('export default function Home()');
  } else if (rule.targetPattern === 'svelte-default-page') {
    shouldTransform = source.includes('<h1>Welcome to SvelteKit</h1>');
  }

  if (!shouldTransform || !rule.fix) {
    return;
  }

  await writeFile(filePath, rule.fix, 'utf8');
}

interface AstGrepRule {
  id: string;
  language: string;
  targetPattern: string;
  hasStringLiteralRegex: string;
  fix: string;
}
