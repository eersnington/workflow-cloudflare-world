import { sleep } from 'workflow';

export async function hello(name = 'Pranay') {
  'use workflow';

  console.log('Starting Workflow in frameworkless webserver');

  await sleep('5s');

  console.log(`Wassgud, ${name}!`);

  return {
    message: `Wassgud, ${name}!`,
    name: name,
    timestamp: Date.now(),
  };
}
