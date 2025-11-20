import { sleep } from 'workflow';

export async function handleSignupWorkflow(email: string) {
  'use workflow';
  await sendWelcomeEmail(email);
  await sleep('1s');
  return { status: 'onboarded', email };
}

async function sendWelcomeEmail(email: string) {
  'use step';
  console.log(`Sending email to ${email}`);
  return true;
}
