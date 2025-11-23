'use client';

import { useMemo } from 'react';
import { ChevronLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { WorkflowListItem } from '@/lib/use-workflows';

type ViewMode = 'canvas' | 'observability';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  workflows: WorkflowListItem[];
  selectedWorkflowId: string | null;
  onSelectWorkflow: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (view: ViewMode) => void;
  loading?: boolean;
  error?: string | null;
  manifestPath?: string;
}

export default function Sidebar({
  isOpen,
  setIsOpen,
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  viewMode,
  onViewModeChange,
  loading,
  error,
  manifestPath,
}: SidebarProps) {
  const sortedWorkflows = useMemo(
    () => [...workflows].sort((a, b) => a.name.localeCompare(b.name)),
    [workflows]
  );

  const hasWorkflows = sortedWorkflows.length > 0;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
          onKeyPress={() => {}}
        />
      )}

      <div
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
          isOpen ? 'w-64' : 'w-0'
        } lg:relative lg:w-64`}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border p-4">
          <h2 className="truncate font-semibold text-sidebar-foreground">
            Workflows
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(!isOpen)}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 border-b border-sidebar-border p-3">
          <Button
            variant={viewMode === 'canvas' ? 'default' : 'outline'}
            className="w-full justify-start text-sm bg-transparent"
            onClick={() => onViewModeChange('canvas')}
          >
            Canvas Viewer
          </Button>
          <Button
            variant={viewMode === 'observability' ? 'default' : 'outline'}
            className="w-full justify-start text-sm bg-transparent"
            onClick={() => onViewModeChange('observability')}
          >
            Observability
          </Button>
        </div>

        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : hasWorkflows ? (
              sortedWorkflows.map((workflow) => (
                <button
                  type="button"
                  key={workflow.id}
                  onClick={() => onSelectWorkflow(workflow.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedWorkflowId === workflow.id
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
                    {workflow.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{workflow.name}</span>
                </button>
              ))
            ) : (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>No workflows found.</div>
                <div>
                  Run <code className="text-xs">workflow build</code> or execute
                  a workflow to generate the manifest.
                </div>
                {manifestPath && (
                  <div className="text-xs text-muted-foreground/80">
                    Looking in: {manifestPath}
                  </div>
                )}
                {error && (
                  <div className="text-xs text-destructive">{error}</div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
    </>
  );
}
