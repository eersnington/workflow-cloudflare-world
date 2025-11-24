'use client';

import {
  Atom,
  useAtom,
  useAtomSet,
  useAtomValue,
} from '@effect-atom/atom-react';
import { useEffect, useMemo } from 'react';
import type { WorkflowListItem } from '@/lib/use-workflows';
import { configAtom, getConfigParams } from '@/lib/config';

type ViewMode = 'canvas' | 'observability';

type NavigationState = {
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

export function useNavigation(): NavigationState {
  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const selectedWorkflowId = useAtomValue(selectedWorkflowIdAtom);
  const setSelectedWorkflowId = useAtomSet(selectedWorkflowIdAtom);
  const { workflows, loading, error, manifestPath } =
    useAtomValue(workflowsAtom);
  const selectedWorkflow = useAtomValue(selectedWorkflowAtom);

  // Keep selection valid when the workflow list changes.
  useEffect(() => {
    if (!workflows.length) {
      setSelectedWorkflowId(null);
      return;
    }
    if (
      !selectedWorkflowId ||
      !workflows.some((wf) => wf.id === selectedWorkflowId)
    ) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [workflows, selectedWorkflowId, setSelectedWorkflowId]);

  return useMemo(
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
      setViewMode,
      selectedWorkflowId,
      setSelectedWorkflowId,
      selectedWorkflow,
      workflows,
      loading,
      error,
      manifestPath,
    ]
  );
}
