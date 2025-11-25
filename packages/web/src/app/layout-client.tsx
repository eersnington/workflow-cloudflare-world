'use client';

import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useRouter } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useEffect } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import {
  buildUrlWithConfig,
  useQueryParamConfig,
  useSyncConfig,
} from '@/lib/config';
import {
  eventIdParamAtom,
  hookIdParamAtom,
  idParamAtom,
  resourceParamAtom,
  runIdParamAtom,
  stepIdParamAtom,
  streamIdParamAtom,
  themeParamAtom,
} from '@/lib/url-params';
import { useAtomValue } from '@effect-atom/atom-react';

interface LayoutClientProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutClientProps) {
  const router = useRouter();
  const config = useQueryParamConfig();
  useSyncConfig(config);
  const id = useAtomValue(idParamAtom);
  const runId = useAtomValue(runIdParamAtom);
  const stepId = useAtomValue(stepIdParamAtom);
  const hookId = useAtomValue(hookIdParamAtom);
  const streamId = useAtomValue(streamIdParamAtom);
  const eventId = useAtomValue(eventIdParamAtom);
  const resource = useAtomValue(resourceParamAtom);
  const theme = useAtomValue(themeParamAtom) || 'system';

  // If initialized with a resource/id or direct ID params, we navigate to the appropriate page
  useEffect(() => {
    // Handle direct ID parameters (runId, stepId, hookId) without resource
    if (!resource) {
      if (runId) {
        // If we have a runId, open that run's detail view
        let targetUrl: string;
        if (stepId) {
          // Open run with step sidebar
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
            sidebar: 'step',
            stepId,
          });
        } else if (eventId) {
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
            sidebar: 'event',
            eventId,
          });
        } else if (streamId) {
          targetUrl = buildUrlWithConfig(
            `/run/${runId}/streams/${streamId}`,
            config
          );
        } else if (hookId) {
          // Open run with hook sidebar
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
            sidebar: 'hook',
            hookId,
          });
        } else {
          // Just open the run
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config);
        }
        router.push(targetUrl);
        return;
      }
      // No resource and no direct params, nothing to do
      return;
    }

    // Handle resource-based navigation
    if (!id) {
      return;
    }

    let targetUrl: string;
    if (resource === 'run') {
      targetUrl = buildUrlWithConfig(`/run/${id}`, config);
    } else if (resource === 'step' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'step',
        stepId: id,
      });
    } else if (resource === 'stream' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'stream',
        streamId: id,
      });
    } else if (resource === 'event' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'event',
        eventId: id,
      });
    } else if (resource === 'hook' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'hook',
        hookId: id,
      });
    } else if (resource === 'hook' && !runId) {
      // Hook without runId - go to home page with hook sidebar
      targetUrl = buildUrlWithConfig('/', config, {
        sidebar: 'hook',
        hookId: id,
      });
    } else {
      console.warn(`Can't deep-link to ${resource} ${id}.`);
      return;
    }

    router.push(targetUrl);
  }, [resource, id, runId, stepId, hookId, streamId, eventId, router, config]);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      enableSystem
      disableTransitionOnChange
    >
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar config={config} />
          <SidebarInset className="px-6 py-2">
            <TooltipProvider delayDuration={0}>
              <div className="w-full h-full flex flex-col">{children}</div>
            </TooltipProvider>
            <Toaster />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export function LayoutClient({ children }: LayoutClientProps) {
  return <LayoutContent>{children}</LayoutContent>;
}
