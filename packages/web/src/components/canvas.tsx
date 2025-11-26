'use client';

import {
  useWorkflowRuns,
  useWorkflowTraceViewerData,
} from '@workflow/web-shared';
import type { Edge, Node, PanelPosition } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { Canvas as FlowCanvas } from '@/components/ai-elements/canvas';
import { Connection } from '@/components/ai-elements/connection';
import { Controls } from '@/components/ai-elements/controls';
import { Edge as EdgeComponent } from '@/components/ai-elements/edge';
import { FlowNodeCard } from '@/components/ai-elements/node';
import { Panel } from '@/components/ai-elements/panel';
import { useNavigation } from '@/components/navigation-store';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { worldConfigToEnvMap } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import type { WorkflowListItem } from '@/hooks/use-workflows';
import { useWorkflows } from '@/hooks/use-workflows';

type CanvasProps = {
  workflow?: WorkflowListItem | null;
  config: WorldConfig;
  workflows: WorkflowListItem[];
};

const nodeTypes = {
  workflow: ({
    data,
  }: {
    data: { title: string; file: string; id: string };
  }) => (
    <FlowNodeCard variant="workflow" title={data.title} subtitle={data.file} />
  ),
  step: ({ data }: { data: { title: string; file: string; id: string } }) => (
    <FlowNodeCard variant="step" title={data.title} subtitle={data.file} />
  ),
};

const edgeTypes = {
  animated: EdgeComponent.Animated,
  temporary: EdgeComponent.Temporary,
};

export function Canvas({
  workflow,
  config,
  workflows: allWorkflows,
}: CanvasProps) {
  const [reloadKey, setReloadKey] = useState<number | null>(null);
  const { workflows: navigationWorkflows } = useNavigation();
  const {
    data: reloadData,
    loading: reloadLoading,
    error: reloadError,
  } = useWorkflows(
    config,
    reloadKey !== null ? { refreshKey: reloadKey, forceBuild: true } : undefined
  );
  const env = useMemo(() => worldConfigToEnvMap(config), [config]);

  // Static discovery (prefer manifest v2 data passed in)
  const { staticWorkflowNodes, staticStepNodes } = useMemo(() => {
    if (!workflow) return { staticWorkflowNodes: [], staticStepNodes: [] };

    const manifestItems = reloadData?.workflows?.length
      ? reloadData.workflows
      : allWorkflows.length
        ? allWorkflows
        : navigationWorkflows;
    const fileItems = manifestItems.filter((f) => f.file === workflow.file);
    return {
      staticWorkflowNodes: [workflow],
      staticStepNodes: fileItems.filter((f) => f.type === 'step'),
    };
  }, [workflow, allWorkflows, navigationWorkflows, reloadData]);
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
    const stepGapY = 180;
    const centerX = 400;
    const workflowGapX = 260;
    const stepStartY = 200;

    // 1. Workflow Nodes
    // Use static workflow nodes if available, otherwise assume the selected workflow is the only one
    const workflowNodes =
      staticWorkflowNodes.length > 0 ? staticWorkflowNodes : [workflow];

    workflowNodes.forEach((wf, index) => {
      nodes.push({
        id: wf.id,
        type: 'workflow',
        position: {
          x: centerX + (index - (workflowNodes.length - 1) / 2) * workflowGapX,
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
        const yPos = startY + 150 + index * stepGapY;
        nodes.push({
          id: step.id,
          type: 'step',
          position: { x: centerX, y: yPos },
          data: {
            title: step.name,
            file: step.file,
            id: step.id,
          },
        });

        if (index === 0) {
          workflowNodes.forEach((wf) => {
            edges.push({
              id: `${wf.id}-${step.id}`,
              source: wf.id,
              target: step.id,
              type: 'animated',
              style: { stroke: 'rgba(37,99,235,0.9)' },
            });
          });
        } else {
          const prevStep = stepNodesToRender[index - 1];
          edges.push({
            id: `${prevStep.id}-${step.id}`,
            source: prevStep.id,
            target: step.id,
            type: 'animated',
            style: { stroke: 'rgba(34,197,94,0.9)' },
          });
        }
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
              <span className="text-sm">Select a workflow to visualize</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setReloadKey(Date.now())}
              disabled={reloadLoading}
            >
              <RotateCcw className="h-4 w-4" />
              {reloadLoading ? 'Reloading…' : 'Reload'}
            </Button>
            {reloadError ? (
              <span className="text-xs text-destructive">Reload failed</span>
            ) : null}
          </div>
        </Panel>
        <Controls />
      </FlowCanvas>
    </div>
  );
}
