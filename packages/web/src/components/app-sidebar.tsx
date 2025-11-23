'use client';

import { Activity, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { SettingsDialog } from '@/components/settings-dialog';
import {
  Sidebar,
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
import { ConnectionStatus } from './display-utils/connection-status';
import { useNavigation } from './navigation-context';
import { useQueryParamConfig } from '@/lib/config';

export function AppSidebar() {
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
  const config = useQueryParamConfig();

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
                <div className="px-2 text-xs text-muted-foreground">
                  No workflows found. Run `workflow build` or execute a workflow
                  to generate a manifest.
                  {manifestPath && (
                    <div className="text-[11px] text-muted-foreground/80">
                      Looking in: {manifestPath}
                    </div>
                  )}
                  {error && (
                    <div className="text-[11px] text-destructive">{error}</div>
                  )}
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ConnectionStatus config={config} />
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
