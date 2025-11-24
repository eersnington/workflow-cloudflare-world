'use client';

import { useEffect, useState } from 'react';
import type { WorldConfig } from '@/lib/config-world';
import { getConfigParams } from '@/lib/config';

export type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
  type: 'workflow' | 'step';
};

type WorkflowResponse =
  | { workflows: WorkflowListItem[]; manifestPath?: string; error?: string }
  | undefined;

export function useWorkflows(config?: WorldConfig) {
  const [data, setData] = useState<WorkflowResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const params = config ? getConfigParams(config) : new URLSearchParams();
    const queryString = params.toString();
    const url = `/api/workflows${queryString ? `?${queryString}` : ''}`;

    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as WorkflowResponse;
        if (!isMounted) return;
        setData(json);
        setError(json?.error ?? null);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [config]); // Re-fetch when config changes

  return {
    data,
    loading,
    error,
  };
}
