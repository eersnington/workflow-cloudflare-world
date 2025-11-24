'use client';

import { Atom, useAtom, useAtomValue } from '@effect-atom/atom-react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { WorkflowListItem } from '@/lib/use-workflows';
import {
  configAtom,
  getConfigParams,
  useQueryParamConfig,
  useSyncConfig,
} from '@/lib/config';

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

type WorkflowsState = {
  workflows: WorkflowListItem[];
  manifestPath?: string;
  loading: boolean;
  error: string | null;
};

const viewModeAtom = Atom.make<ViewMode>('canvas').pipe(Atom.keepAlive);
const selectedWorkflowIdAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive
);

const workflowsAtom = Atom.make<WorkflowsState>((get) => {
  const config = get(configAtom);
  const params = getConfigParams(config);
  const queryString = params.toString();
  const url = `/api/workflows${queryString ? `?${queryString}` : ''}`;
  const controller = new AbortController();

  get.addFinalizer(() => controller.abort());

  // Start in loading state
  get.setSelf({
    workflows: [],
    manifestPath: undefined,
    loading: true,
    error: null,
  });

  fetch(url, { cache: 'no-store', signal: controller.signal })
    .then(async (res) => {
      const json = (await res.json()) as
        | {
            workflows: WorkflowListItem[];
            manifestPath?: string;
            error?: string;
          }
        | undefined;
      get.setSelf({
        workflows: json?.workflows ?? [],
        manifestPath: json?.manifestPath,
        loading: false,
        error: json?.error ?? null,
      });
    })
    .catch((err) => {
      if (controller.signal.aborted) return;
      get.setSelf({
        workflows: [],
        manifestPath: undefined,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  return {
    workflows: [],
    manifestPath: undefined,
    loading: true,
    error: null,
  };
}).pipe(Atom.keepAlive);

const selectedWorkflowAtom = Atom.make<WorkflowListItem | null>((get) => {
  const { workflows } = get(workflowsAtom);
  const selectedId = get(selectedWorkflowIdAtom);
  if (!workflows.length) return null;
  return workflows.find((wf) => wf.id === selectedId) ?? workflows[0] ?? null;
}).pipe(Atom.keepAlive);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const urlConfig = useQueryParamConfig();
  useSyncConfig(urlConfig);

  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const [selectedWorkflowId, setSelectedWorkflowId] = useAtom(
    selectedWorkflowIdAtom
  );
  const { workflows, loading, error, manifestPath } =
    useAtomValue(workflowsAtom);
  const selectedWorkflow = useAtomValue(selectedWorkflowAtom);

  useEffect(() => {
    if (!workflows.length) {
      setSelectedWorkflowId(null);
      return;
    }

    if (!selectedWorkflowId) {
      setSelectedWorkflowId(workflows[0].id);
      return;
    }

    const exists = workflows.some((wf) => wf.id === selectedWorkflowId);
    if (!exists) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [workflows, selectedWorkflowId, setSelectedWorkflowId]);

  const value: NavigationContextValue = useMemo(
    () => ({
      viewMode,
      setViewMode,
      selectedWorkflowId,
      setSelectedWorkflowId,
      selectedWorkflow,
      workflows,
      loading,
      error,
      manifestPath,
    }),
    [
      viewMode,
      selectedWorkflowId,
      selectedWorkflow,
      workflows,
      loading,
      error,
      manifestPath,
      setViewMode,
      setSelectedWorkflowId,
    ]
  );

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
