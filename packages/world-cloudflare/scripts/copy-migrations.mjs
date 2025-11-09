import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const sourceDir = join(packageRoot, 'src', 'drizzle', 'migrations');
const targetDir = join(packageRoot, 'dist', 'src', 'drizzle', 'migrations');

if (!existsSync(sourceDir)) {
  console.warn(
    `No migrations directory found at ${sourceDir}. Skipping migration copy.`
  );
  process.exit(0);
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true });
}
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
