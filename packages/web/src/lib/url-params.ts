'use client';

import { Atom } from '@effect-atom/atom-react';

const makeSearchParamAtom = (key: string) => {
  if (typeof window === 'undefined') {
    // SSR-safe fallback; cast so useAtomSet keeps working client-side
    return Atom.make<string | null>(null).pipe(
      Atom.keepAlive
    ) as unknown as Atom.Writable<string | null, string | null>;
  }
  return Atom.searchParam(key).pipe(Atom.keepAlive);
};

// Core navigation params
export const resourceParamAtom = makeSearchParamAtom('resource');
export const idParamAtom = makeSearchParamAtom('id');
export const runIdParamAtom = makeSearchParamAtom('runId');
export const stepIdParamAtom = makeSearchParamAtom('stepId');
export const hookIdParamAtom = makeSearchParamAtom('hookId');
export const eventIdParamAtom = makeSearchParamAtom('eventId');
export const streamIdParamAtom = makeSearchParamAtom('streamId');
export const sidebarParamAtom = makeSearchParamAtom('sidebar');

// Filters and UI
export const workflowFilterParamAtom = makeSearchParamAtom('workflow');
export const statusFilterParamAtom = makeSearchParamAtom('status');
export const themeParamAtom = makeSearchParamAtom('theme');
