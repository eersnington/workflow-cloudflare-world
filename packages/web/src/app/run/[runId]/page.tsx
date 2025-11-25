'use client';

import { useParams } from 'next/navigation';
import { ErrorBoundary } from '@/components/error-boundary';
import { RunDetailView } from '@/components/run-detail-view';
import { useQueryParamConfig } from '@/lib/config';
import {
  eventIdParamAtom,
  hookIdParamAtom,
  stepIdParamAtom,
} from '@/lib/url-params';
import { useAtomValue } from '@effect-atom/atom-react';

export default function RunDetailPage() {
  const params = useParams();
  const config = useQueryParamConfig();
  const stepId = useAtomValue(stepIdParamAtom);
  const eventId = useAtomValue(eventIdParamAtom);
  const hookId = useAtomValue(hookIdParamAtom);

  const runId = params.runId as string;
  const selectedId = stepId
    ? stepId
    : eventId
      ? eventId
      : hookId
        ? hookId
        : undefined;

  return (
    <ErrorBoundary
      title="Run Detail Error"
      description="Failed to load run details. Please try navigating back to the home page."
    >
      <RunDetailView config={config} runId={runId} selectedId={selectedId} />
    </ErrorBoundary>
  );
}
