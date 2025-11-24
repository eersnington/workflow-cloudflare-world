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
import { useNavigation } from '@/components/navigation-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { worldConfigToEnvMap } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import type { WorkflowListItem } from '@/lib/use-workflows';

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
    <WorkflowNode handles={{ target: false, source: true }}>
      <NodeHeader className="bg-primary/10 border-b-primary/20">
        <NodeTitle className="text-base font-mono">{data.title}</NodeTitle>
        <NodeDescription className="text-xs text-muted-foreground font-mono truncate">
          {data.id}
        </NodeDescription>
      </NodeHeader>
      <NodeContent>
        <div className="flex flex-col gap-2">
          <Badge variant="default" className="w-fit">
            use workflow
          </Badge>
          <p className="text-xs text-muted-foreground break-all">{data.file}</p>
        </div>
      </NodeContent>
      <NodeFooter className="bg-primary/5 border-t-primary/20">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted-foreground">Entry Point</span>
        </div>
      </NodeFooter>
      <Toolbar>
        <Button size="sm" variant="ghost">
          View Code
        </Button>
      </Toolbar>
    </WorkflowNode>
  ),
  step: ({ data }: { data: { title: string; file: string; id: string } }) => (
    <WorkflowNode handles={{ target: true, source: true }}>
      <NodeHeader>
        <NodeTitle className="text-base font-mono">{data.title}</NodeTitle>
        <NodeDescription className="text-xs text-muted-foreground font-mono truncate">
          {data.id}
        </NodeDescription>
      </NodeHeader>
      <NodeContent>
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="w-fit">
            use step
          </Badge>
        </div>
      </NodeContent>
    </WorkflowNode>
  ),
};

const edgeTypes = {
  animated: EdgeComponent.Animated,
  temporary: EdgeComponent.Temporary,
};

export function Canvas({ workflow, config }: CanvasProps) {
  const { workflows: allFunctions } = useNavigation();
  const env = useMemo(() => worldConfigToEnvMap(config), [config]);

  // Static discovery
  const { staticWorkflowNodes, staticStepNodes } = useMemo(() => {
    if (!workflow) return { staticWorkflowNodes: [], staticStepNodes: [] };

    const fileFunctions = allFunctions.filter((f) => f.file === workflow.file);
    return {
      // Only show the selected workflow to avoid cluttering the canvas with other workflows in the same file
      staticWorkflowNodes: [workflow],
      staticStepNodes: fileFunctions.filter((f) => f.type === 'step'),
    };
  }, [workflow, allFunctions]);
  const hasStaticSteps = staticStepNodes.length > 0;

  // Dynamic discovery (Fallback)
  const { data: runsData } = useWorkflowRuns(env, {
    workflowName: workflow?.id,
    limit: 1,
  });
  const latestRun = runsData?.data?.[0];
  const { steps: runSteps } = useWorkflowTraceViewerData(
    env,
    latestRun?.runId ?? '',
    {
      live: false,
    }
  );

  const { nodes, edges } = useMemo(() => {
    if (!workflow) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Layout constants
    const startY = 50;
    const stepStartY = 300;
    const itemGapX = 400;
    const centerX = 400;

    // 1. Workflow Nodes
    // Use static workflow nodes if available, otherwise assume the selected workflow is the only one
    const workflowNodes =
      staticWorkflowNodes.length > 0 ? staticWorkflowNodes : [workflow];

    workflowNodes.forEach((wf, index) => {
      nodes.push({
        id: wf.id,
        type: 'workflow',
        position: {
          x: centerX + (index - (workflowNodes.length - 1) / 2) * itemGapX,
          y: startY,
        },
        data: {
          title: wf.name,
          file: wf.file,
          id: wf.id,
        },
      });
    });

    // 2. Step Nodes
    let stepNodesToRender: { id: string; name: string; file: string }[] = [];

    if (hasStaticSteps) {
      stepNodesToRender = staticStepNodes;
    } else if (latestRun && runSteps.length > 0) {
      // Infer steps from execution trace
      const uniqueSteps = new Map<string, { id: string; name: string }>();
      runSteps.forEach((s) => {
        // Clean up step name if it contains ID junk, or just use as is
        // Assuming stepId is stable or we use stepName
        if (!uniqueSteps.has(s.stepName)) {
          uniqueSteps.set(s.stepName, { id: s.stepName, name: s.stepName });
        }
      });
      stepNodesToRender = Array.from(uniqueSteps.values()).map((s) => ({
        id: s.id,
        name: s.name,
        file: 'Inferred from trace', // Visual indicator
      }));
    }

    if (stepNodesToRender.length === 0) {
      // Fallback visual if absolutely no steps found
      nodes.push({
        id: 'no-steps-info',
        type: 'step',
        position: { x: centerX, y: stepStartY },
        data: {
          title: 'No Steps Discovered',
          file: 'Run `workflow build` or execute workflow',
          id: 'info-no-steps',
        } as any,
      });

      workflowNodes.forEach((wf) => {
        edges.push({
          id: `${wf.id}-no-steps`,
          source: wf.id,
          target: 'no-steps-info',
          type: 'temporary',
          style: { stroke: 'var(--border)', strokeDasharray: '5, 5' },
        });
      });
    } else {
      stepNodesToRender.forEach((step, index) => {
        const xPos =
          centerX + (index - (stepNodesToRender.length - 1) / 2) * itemGapX;
        nodes.push({
          id: step.id,
          type: 'step',
          position: { x: xPos, y: stepStartY },
          data: {
            title: step.name,
            file: step.file,
            id: step.id,
          },
        });

        workflowNodes.forEach((wf) => {
          edges.push({
            id: `${wf.id}-${step.id}`,
            source: wf.id,
            target: step.id,
            type: 'temporary',
            style: { stroke: 'var(--border)' },
          });
        });
      });
    }

    return { nodes, edges };
  }, [
    workflow,
    staticWorkflowNodes,
    staticStepNodes,
    hasStaticSteps,
    latestRun,
    runSteps,
  ]);

  return (
    <div className="h-full w-full pb-8">
      <FlowCanvas
        className="h-full rounded-lg"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={Connection}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position={'top-right' satisfies PanelPosition}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-2 py-1">
            {workflow ? (
              <span className="font-medium text-foreground">
                {workflow.file}
              </span>
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
