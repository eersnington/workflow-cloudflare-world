export async function longRunningWorkflow() {
  'use workflow';
  console.log('Starting long-running workflow at:', new Date().toISOString());

  const result = await longRunningStep(342_000); // 5 minutes 42 seconds
  // holding the step handler open for 5+ minutes makes the local queue fetch hit undici's headersTimeout (UND_ERR_HEADERS_TIMEOUT)

  console.log('Completed long-running workflow at:', new Date().toISOString());
  return result;
}

async function longRunningStep(durationMs: number) {
  'use step';
  console.log(
    `Starting long-running step that will run for ${durationMs}ms at:`,
    new Date().toISOString()
  );

  await new Promise((r) => setTimeout(r, durationMs));

  console.log(
    `Completed long-running step after ${durationMs}ms at:`,
    new Date().toISOString()
  );
  return { success: true, duration: durationMs };
}
