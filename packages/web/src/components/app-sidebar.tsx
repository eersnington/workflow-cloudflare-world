'use client';

import { Activity, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { SettingsDialog } from '@/components/settings-dialog';
import {
  Sidebar,
  SidebarContext,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Logo } from '@/icons/logo';
import type { WorldConfig } from '@/lib/config-world';
import { useNavigation } from './navigation-context';
import { ConnectionStatus } from './display-utils/connection-status';

interface AppSidebarProps {
  config: WorldConfig;
}

export function AppSidebar({ config }: AppSidebarProps) {
  const {
    workflows,
    loading,
    error,
    viewMode,
    setViewMode,
    selectedWorkflowId,
    setSelectedWorkflowId,
    manifestPath,
  } = useNavigation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Link href="https://useworkflow.dev" target="_blank">
            <h1
              className="flex items-center gap-2"
              title="Workflow Observability"
            >
              <Logo />
            </h1>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={viewMode === 'canvas'}
                  onClick={() => setViewMode('canvas')}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Canvas Viewer</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={viewMode === 'observability'}
                  onClick={() => setViewMode('observability')}
                >
                  <Activity className="h-4 w-4" />
                  <span>Observability</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Workflows</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <SidebarMenuItem key={`wf-skel-${idx}`}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))
              ) : workflows.length ? (
                workflows
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((workflow) => (
                    <SidebarMenuItem key={workflow.id}>
                      <SidebarMenuButton
                        isActive={selectedWorkflowId === workflow.id}
                        onClick={() => setSelectedWorkflowId(workflow.id)}
                      >
                        <span className="truncate">{workflow.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
              ) : (
                <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                  <SidebarMenuButton className="flex-col items-start gap-1">
                    <span className="text-xs text-muted-foreground">
                      No workflows found.
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Run `workflow build` or execute a workflow.
                    </span>
                    {manifestPath && (
                      <span className="text-[10px] text-muted-foreground/80">
                        Looking in: {manifestPath}
                      </span>
                    )}
                    {error && (
                      <span className="text-[10px] text-destructive">
                        {error}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <ConnectionStatus config={config} />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SettingsDialog
          trigger={
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          }
        />
      </SidebarFooter>
    </Sidebar>
  );
}
