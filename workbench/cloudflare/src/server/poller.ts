import type { WorkerClient, WorkflowRun } from './worker-client.js';

export class BackgroundPoller {
  private interval: NodeJS.Timeout | null = null;
  private isActive = false;

  start(
    client: WorkerClient,
    onUpdate: (runs: WorkflowRun[]) => void,
    intervalMs = 2000
  ): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.interval = setInterval(async () => {
      try {
        const result = await client.listRuns({ limit: 20 });
        onUpdate(result.runs);
      } catch {
        // Silently ignore polling errors (e.g., database not initialized)
        // Errors will be shown during initial setup
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isActive = false;
  }

  pause(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  resume(
    client: WorkerClient,
    onUpdate: (runs: WorkflowRun[]) => void,
    intervalMs = 2000
  ): void {
    if (!this.isActive || this.interval) {
      return;
    }
    this.start(client, onUpdate, intervalMs);
  }
}
