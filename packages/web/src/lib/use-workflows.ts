'use client';

import { useEffect, useState } from 'react';

export type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
};

type WorkflowResponse =
  | { workflows: WorkflowListItem[]; manifestPath?: string; error?: string }
  | undefined;

export function useWorkflows() {
  const [data, setData] = useState<WorkflowResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch('/api/workflows', { cache: 'no-store' })
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
  }, []);

  return {
    data,
    loading,
    error,
  };
}
