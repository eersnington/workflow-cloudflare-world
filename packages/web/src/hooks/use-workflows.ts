'use client';

import { getConfigParams } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import { useEffect, useState } from 'react';

export type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
  type: 'workflow' | 'step';
};

type WorkflowResponse =
  | {
      workflows: WorkflowListItem[];
      manifestPath?: string;
      error?: string;
    }
  | undefined;

type UseWorkflowsOptions = {
  refreshKey?: any;
  forceBuild?: boolean;
};

export function useWorkflows(config?: WorldConfig, opts?: UseWorkflowsOptions) {
  const [data, setData] = useState<WorkflowResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (config) {
      Object.entries(config).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
    }
    if (opts?.refreshKey !== undefined) {
      params.set('_', String(opts.refreshKey));
    }
    if (opts?.forceBuild) {
      params.set('forceBuild', '1');
    }
    const queryString = params.toString();
    const url = `/api/workflows${queryString ? `?${queryString}` : ''}`;

    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as WorkflowResponse;
        setData(json);
        setError(json?.error ?? null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setData(undefined);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [config, opts?.refreshKey, opts?.forceBuild]); // Re-fetch when config changes or refreshKey changes

  return {
    data,
    loading,
    error,
  };
}
