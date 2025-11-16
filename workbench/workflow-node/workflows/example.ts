import { sleep } from 'workflow';

export async function handleGreeting(name: string) {
  'use workflow';

  await sayHello(name);
  await sleep('1s');
  await sayHello(`${name}, again`);
}

async function sayHello(name: string) {
  'use step';
  console.log(`Hello ${name}`);
}
