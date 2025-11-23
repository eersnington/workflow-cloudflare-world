'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { HooksTable } from '@/components/hooks-table';
import { RunsTable } from '@/components/runs-table';
import Sidebar from '@/components/sidebar';
import { Canvas } from '@/components/canvas';
import { buildUrlWithConfig, useQueryParamConfig } from '@/lib/config';
import { useWorkflows } from '@/lib/use-workflows';
import type { WorkflowListItem } from '@/lib/use-workflows';

type ViewMode = 'canvas' | 'observability';

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
  const { data, loading, error } = useWorkflows();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null
  );

  const sidebar = searchParams.get('sidebar');
  const hookId = searchParams.get('hookId') || searchParams.get('hook');
  const selectedHookId = sidebar === 'hook' && hookId ? hookId : undefined;

  useEffect(() => {
    if (data?.workflows && data.workflows.length > 0 && !selectedWorkflowId) {
      setSelectedWorkflowId(data.workflows[0].id);
    }
  }, [data?.workflows, selectedWorkflowId]);

  const selectedWorkflow: WorkflowListItem | null = useMemo(() => {
    if (!data?.workflows) return null;
    return (
      data.workflows.find((wf) => wf.id === selectedWorkflowId) ??
      data.workflows[0] ??
      null
    );
  }, [data?.workflows, selectedWorkflowId]);

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
      <div className="flex h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          workflows={data?.workflows ?? []}
          selectedWorkflowId={selectedWorkflowId}
          onSelectWorkflow={setSelectedWorkflowId}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          loading={loading}
          error={error}
          manifestPath={data?.manifestPath}
        />

        <main
          className={`flex-1 transition-all duration-300 ${
            !sidebarOpen ? 'ml-0' : ''
          }`}
        >
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
        </main>
      </div>
    </ReactFlowProvider>
  );
}
