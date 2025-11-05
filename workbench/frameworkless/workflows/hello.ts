import { sleep } from 'workflow';

export async function hello(name = 'Pranay'): Promise<string> {
  'use workflow';

  await sleep('5s');

  return `Wassgud, ${name}!`;
}
