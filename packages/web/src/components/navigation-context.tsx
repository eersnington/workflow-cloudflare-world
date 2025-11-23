'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WorkflowListItem } from '@/lib/use-workflows';
import { useWorkflows } from '@/lib/use-workflows';

type ViewMode = 'canvas' | 'observability';

type NavigationContextValue = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
  selectedWorkflow: WorkflowListItem | null;
  workflows: WorkflowListItem[];
  loading: boolean;
  error: string | null;
  manifestPath?: string;
};

const NavigationContext = createContext<NavigationContextValue | undefined>(
  undefined
);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, loading, error } = useWorkflows();
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null
  );

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

  const value: NavigationContextValue = {
    viewMode,
    setViewMode,
    selectedWorkflowId,
    setSelectedWorkflowId,
    selectedWorkflow,
    workflows: data?.workflows ?? [],
    loading,
    error: error ?? null,
    manifestPath: data?.manifestPath,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return ctx;
}
