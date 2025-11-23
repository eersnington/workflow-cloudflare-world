'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WorkflowListItem } from '@/lib/use-workflows';
import { useWorkflows } from '@/lib/use-workflows';

type ViewMode = 'canvas' | 'observability';

type SidebarContextValue = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
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

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined
);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = useWorkflows();
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  const value: SidebarContextValue = {
    sidebarOpen,
    setSidebarOpen,
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
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebarState() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebarState must be used within SidebarProvider');
  }
  return ctx;
}
