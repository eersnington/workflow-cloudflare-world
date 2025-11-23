'use client';

import {
  useWorkflowRuns,
  useWorkflowTraceViewerData,
} from '@workflow/web-shared';
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
import { worldConfigToEnvMap } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import { type WorkflowListItem } from '@/lib/use-workflows';
import { formatDuration } from '@/lib/utils';

type CanvasProps = {
  workflow?: WorkflowListItem | null;
  config: WorldConfig;
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
  step: ({
    data,
  }: {
    data: {
      title: string;
      id: string;
      status: string;
      duration?: string | null;
      isLast: boolean;
    };
  }) => (
    <WorkflowNode handles={{ target: true, source: !data.isLast }}>
      <NodeHeader>
        <NodeTitle className="text-base">{data.title}</NodeTitle>
        <NodeDescription className="text-xs text-muted-foreground">
          {data.id}
        </NodeDescription>
      </NodeHeader>
      <NodeContent>
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">Step Execution</div>
        </div>
      </NodeContent>
      <NodeFooter>
        <div className="flex items-center justify-between w-full">
          <Badge
            variant={
              data.status === 'completed'
                ? 'default'
                : data.status === 'failed'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {data.status}
          </Badge>
          {data.duration && (
            <span className="text-xs text-muted-foreground">
              {data.duration}
            </span>
          )}
        </div>
      </NodeFooter>
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

export function Canvas({ workflow, config }: CanvasProps) {
  const env = useMemo(() => worldConfigToEnvMap(config), [config]);

  // Fetch latest run for the selected workflow
  const { data: runsData } = useWorkflowRuns(env, {
    workflowName: workflow?.id,
    limit: 1,
  });

  const latestRun = runsData?.data?.[0];

  // Fetch steps for the latest run
  const { steps } = useWorkflowTraceViewerData(env, latestRun?.runId ?? '', {
    live: false,
  });

  const { nodes, edges } = useMemo(() => {
    if (!workflow) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const baseY = 120;
    let currentX = 0;
    const nodeGap = 400;

    // Start Node
    const startNode: Node = {
      id: 'start',
      type: 'start',
      position: { x: currentX, y: baseY },
      data: {
        title: 'Start',
        description: latestRun
          ? `Run: ${latestRun.runId}`
          : 'Waiting for run...',
      },
    };
    nodes.push(startNode);
    currentX += nodeGap;

    if (latestRun && steps.length > 0) {
      // Sort steps by start time
      const sortedSteps = [...steps].sort((a, b) => {
        const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return timeA - timeB;
      });

      // Connect Start to First Step
      edges.push({
        id: `edge-start-${sortedSteps[0].stepId}`,
        source: startNode.id,
        target: sortedSteps[0].stepId,
        type: 'animated',
        animated: true,
        style: { stroke: 'var(--ring)' },
      });

      // Generate nodes for steps
      sortedSteps.forEach((step, index) => {
        const duration = formatDuration(step.startedAt, step.completedAt);
        const isLast = index === sortedSteps.length - 1;

        const stepNode: Node = {
          id: step.stepId,
          type: 'step',
          position: { x: currentX, y: baseY },
          data: {
            title: step.stepName,
            id: step.stepId,
            status: step.status,
            duration,
            isLast,
          },
        };

        nodes.push(stepNode);

        // Connect to previous step (if not first)
        if (index > 0) {
          edges.push({
            id: `edge-${sortedSteps[index - 1].stepId}-${step.stepId}`,
            source: sortedSteps[index - 1].stepId,
            target: step.stepId,
            type: 'animated',
            animated: true,
            style: { stroke: 'var(--ring)' },
          });
        }

        currentX += nodeGap;
      });
    } else {
      // Fallback: Workflow Placeholder Node
      const workflowNode: Node = {
        id: workflow.id,
        type: 'workflow',
        position: { x: currentX, y: baseY },
        data: {
          title: workflow.name,
          file: workflow.file,
          id: workflow.id,
        },
      };
      nodes.push(workflowNode);

      edges.push({
        id: `${startNode.id}-${workflow.id}`,
        source: startNode.id,
        target: workflow.id,
        type: 'animated',
        animated: true,
        style: { stroke: 'var(--ring)' },
      });
    }

    return { nodes, edges };
  }, [workflow, latestRun, steps]);

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
