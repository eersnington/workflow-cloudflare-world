'use client';

import type { Edge, Node, PanelPosition } from '@xyflow/react';
import { useMemo } from 'react';
import { Canvas as FlowCanvas } from '@/components/ai-elements/canvas';
import { Connection } from '@/components/ai-elements/connection';
import { Controls } from '@/components/ai-elements/controls';
import { Edge as EdgeComponent } from '@/components/ai-elements/edge';
import {
  Node as WorkflowNode,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import { Panel } from '@/components/ai-elements/panel';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkflowListItem } from '@/lib/use-workflows';

type CanvasProps = {
  workflow?: WorkflowListItem | null;
};

const nodeTypes = {
  workflow: ({
    data,
  }: {
    data: { title: string; file: string; id: string };
  }) => (
    <WorkflowNode handles={{ target: true, source: true }}>
      <NodeHeader>
        <NodeTitle className="text-base">{data.title}</NodeTitle>
        <NodeDescription className="text-xs text-muted-foreground">
          {data.id}
        </NodeDescription>
      </NodeHeader>
      <NodeContent>
        <p className="text-sm text-muted-foreground">{data.file}</p>
      </NodeContent>
      <NodeFooter>
        <div className="flex items-center justify-between w-full">
          <Badge variant="secondary">Workflow</Badge>
          <span className="text-xs text-muted-foreground">Status: Ready</span>
        </div>
      </NodeFooter>
      <Toolbar>
        <Button size="sm" variant="ghost">
          Edit
        </Button>
        <Button size="sm" variant="ghost">
          Delete
        </Button>
      </Toolbar>
    </WorkflowNode>
  ),
  start: ({ data }: { data: { title: string; description?: string } }) => (
    <WorkflowNode handles={{ target: false, source: true }}>
      <NodeHeader>
        <NodeTitle className="text-base">{data.title}</NodeTitle>
        {data.description && (
          <NodeDescription className="text-xs text-muted-foreground">
            {data.description}
          </NodeDescription>
        )}
      </NodeHeader>
    </WorkflowNode>
  ),
};

const edgeTypes = {
  animated: EdgeComponent.Animated,
  temporary: EdgeComponent.Temporary,
};

export function Canvas({ workflow }: CanvasProps) {
  const { nodes, edges } = useMemo(() => {
    if (!workflow) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const baseY = 120;
    const startNode: Node = {
      id: 'start',
      type: 'start',
      position: { x: 0, y: baseY },
      data: { title: 'Workflow Entry' },
    };

    const workflowNode: Node = {
      id: workflow.id,
      type: 'workflow',
      position: { x: 320, y: baseY },
      data: {
        title: workflow.name,
        file: workflow.file,
        id: workflow.id,
      },
    };

    const edge: Edge = {
      id: `${startNode.id}-${workflow.id}`,
      source: startNode.id,
      target: workflow.id,
      type: 'animated',
      animated: true,
      style: { stroke: 'var(--ring)' },
    };

    return { nodes: [startNode, workflowNode], edges: [edge] };
  }, [workflow]);

  return (
    <div className="h-full w-full pb-4">
      <FlowCanvas
        className="h-full rounded-lg"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={Connection}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position={'top-left' satisfies PanelPosition}>
          <Button size="sm" variant="secondary">
            Export
          </Button>
        </Panel>
        <Panel position={'top-right' satisfies PanelPosition}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {workflow ? (
              <>
                <span className="font-medium text-foreground">
                  {workflow.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {workflow.file}
                </span>
              </>
            ) : (
              <span className="text-xs">Select a workflow to visualize</span>
            )}
          </div>
        </Panel>
        <Controls />
      </FlowCanvas>
    </div>
  );
}
