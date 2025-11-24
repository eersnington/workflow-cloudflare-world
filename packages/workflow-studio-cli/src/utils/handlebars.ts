import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import Handlebars from 'handlebars';

export type RenderTemplateContext = Record<string, any>;

export async function renderTemplate(
  templatePath: string,
  targetDir: string,
  context: RenderTemplateContext
) {
  const entries = await readdir(templatePath, {
    recursive: true,
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      continue;
    }

    const sourcePath = join(entry.parentPath, entry.name);
    const relativePath = relative(templatePath, sourcePath);

    // Handle special filenames if needed (e.g. _gitignore -> .gitignore)
    // For now, we assume standard filenames or .hbs extensions
    let targetPath = join(targetDir, relativePath);

    if (targetPath.endsWith('.hbs')) {
      targetPath = targetPath.slice(0, -4); // Remove .hbs
      const templateContent = await readFile(sourcePath, 'utf8');
      const template = Handlebars.compile(templateContent);
      const result = template(context);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, result, 'utf8');
    } else {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}
