import type { CLIState } from '@/core/state.js';
import type { BackgroundPoller } from '@/server/poller.js';
import type { WorkerClient } from '@/server/worker-client.js';

export interface ActionContext {
  state: CLIState;
  client: WorkerClient;
  poller: BackgroundPoller;
}
