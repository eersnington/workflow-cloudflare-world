import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeTemplateFiles(
  targetDir: string,
  files: Record<string, string>
) {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const fullPath = join(targetDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    })
  );
}
