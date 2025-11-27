import Handlebars from 'handlebars';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, test } from 'vitest';

async function listHbsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listHbsFiles(fullPath)));
    } else if (extname(entry.name) === '.hbs') {
      files.push(fullPath);
    }
  }
  return files;
}

async function renderHandlebars(filePath: string) {
  const source = await readFile(filePath, 'utf8');
  const template = Handlebars.compile(source);
  return template({ projectName: 'demo-app' });
}

describe('handlebars templates render', () => {
  test('all .hbs files compile without leftover mustaches', async () => {
    const templatesDir = new URL('../src/handlebars', import.meta.url).pathname;
    const files = await listHbsFiles(templatesDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const rendered = await renderHandlebars(file);
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    }
  });
});
