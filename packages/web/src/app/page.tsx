'use client';

import { Canvas } from '@/components/canvas';
import { ErrorBoundary } from '@/components/error-boundary';
import { HooksTable } from '@/components/hooks-table';
import { useNavigation } from '@/components/navigation-store';
import { RunsTable } from '@/components/runs-table';
import { buildUrlWithConfig, useQueryParamConfig } from '@/lib/config';
import { hookIdParamAtom, sidebarParamAtom } from '@/lib/url-params';
import { useAtomValue } from '@effect-atom/atom-react';
import { ReactFlowProvider } from '@xyflow/react';
import { useRouter } from 'next/navigation';
import { useWorkflows } from '@/hooks/use-workflows';

function ObservabilityView({
  config,
  onRunClick,
  onHookSelect,
  selectedHookId,
}: {
  config: ReturnType<typeof useQueryParamConfig>;
  onRunClick: (runId: string, streamId?: string) => void;
  onHookSelect: (hookId: string, runId?: string) => void;
  selectedHookId?: string;
}) {
  return (
    <div className="space-y-6 w-full">
      <ErrorBoundary
        title="Runs Error"
        description="Failed to load workflow runs. Please try refreshing the page."
      >
        <RunsTable config={config} onRunClick={onRunClick} />
      </ErrorBoundary>

      <ErrorBoundary
        title="Hooks Error"
        description="Failed to load hooks. Please try refreshing the page."
      >
        <HooksTable
          config={config}
          onHookClick={onHookSelect}
          selectedHookId={selectedHookId}
        />
      </ErrorBoundary>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const config = useQueryParamConfig();
  const { viewMode, selectedWorkflow } = useNavigation();
  const { data: workflowsData } = useWorkflows(config);

  const sidebar = useAtomValue(sidebarParamAtom);
  const hookId = useAtomValue(hookIdParamAtom);
  const selectedHookId = sidebar === 'hook' && hookId ? hookId : undefined;

  const handleRunClick = (runId: string, streamId?: string) => {
    if (!streamId) {
      router.push(buildUrlWithConfig(`/run/${runId}`, config));
    } else {
      router.push(
        buildUrlWithConfig(`/run/${runId}/streams/${streamId}`, config)
      );
    }
  };

  const handleHookSelect = (hookId: string, runId?: string) => {
    if (hookId) {
      router.push(
        buildUrlWithConfig(`/run/${runId}`, config, {
          sidebar: 'hook',
          hookId,
        })
      );
    } else {
      router.push(buildUrlWithConfig(`/run/${runId}`, config));
    }
  };

  return (
    <ReactFlowProvider>
      {viewMode === 'observability' ? (
        <div className="h-full w-full overflow-auto">
          <ObservabilityView
            config={config}
            onRunClick={handleRunClick}
            onHookSelect={handleHookSelect}
            selectedHookId={selectedHookId}
          />
        </div>
      ) : (
        <div className="h-full w-full">
          <Canvas
            workflow={selectedWorkflow}
            config={config}
            workflows={workflowsData?.workflows ?? []}
          />
        </div>
      )}
    </ReactFlowProvider>
  );
}
