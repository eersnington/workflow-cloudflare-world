'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorBoundary } from '@/components/error-boundary';
import { HooksTable } from '@/components/hooks-table';
import { RunsTable } from '@/components/runs-table';
import { Canvas } from '@/components/canvas';
import { useSidebarState } from '@/components/sidebar-context';
import { buildUrlWithConfig, useQueryParamConfig } from '@/lib/config';

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
    <div className="space-y-6">
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
  const searchParams = useSearchParams();
  const config = useQueryParamConfig();
  const { viewMode, selectedWorkflow } = useSidebarState();

  const sidebar = searchParams.get('sidebar');
  const hookId = searchParams.get('hookId') || searchParams.get('hook');
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
        <div className="h-full overflow-auto p-6">
          <ObservabilityView
            config={config}
            onRunClick={handleRunClick}
            onHookSelect={handleHookSelect}
            selectedHookId={selectedHookId}
          />
        </div>
      ) : (
        <div className="h-full p-6">
          <Canvas workflow={selectedWorkflow} />
        </div>
      )}
    </ReactFlowProvider>
  );
}
