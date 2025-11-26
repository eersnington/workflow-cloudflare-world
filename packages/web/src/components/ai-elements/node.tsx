import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Handle, Position } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';

export type NodeHandles = {
  target?: boolean;
  source?: boolean;
  targetPosition?: Position;
  sourcePosition?: Position;
};

export type NodeProps = ComponentProps<typeof Card> & {
  handles?: NodeHandles;
};

export const Node = ({ handles, className, ...props }: NodeProps) => (
  <Card
    className={cn(
      'node-container relative size-full h-auto w-sm gap-0 rounded-md p-0',
      className
    )}
    {...props}
  >
    {handles?.target && (
      <Handle
        position={handles.targetPosition ?? Position.Top}
        type="target"
        className="h-3 w-3 border-2 border-background/80 bg-foreground shadow"
      />
    )}
    {handles?.source && (
      <Handle
        position={handles.sourcePosition ?? Position.Bottom}
        type="source"
        className="h-3 w-3 border-2 border-background/80 bg-foreground shadow"
      />
    )}
    {props.children}
  </Card>
);

export type NodeHeaderProps = ComponentProps<typeof CardHeader>;

export const NodeHeader = ({ className, ...props }: NodeHeaderProps) => (
  <CardHeader
    className={cn('gap-0.5 rounded-t-md border-b bg-secondary p-3!', className)}
    {...props}
  />
);

export type NodeTitleProps = ComponentProps<typeof CardTitle>;

export const NodeTitle = (props: NodeTitleProps) => <CardTitle {...props} />;

export type NodeDescriptionProps = ComponentProps<typeof CardDescription>;

export const NodeDescription = (props: NodeDescriptionProps) => (
  <CardDescription {...props} />
);

export type NodeActionProps = ComponentProps<typeof CardAction>;

export const NodeAction = (props: NodeActionProps) => <CardAction {...props} />;

export type NodeContentProps = ComponentProps<typeof CardContent>;

export const NodeContent = ({ className, ...props }: NodeContentProps) => (
  <CardContent className={cn('p-3', className)} {...props} />
);

export type NodeFooterProps = ComponentProps<typeof CardFooter>;

export const NodeFooter = ({ className, ...props }: NodeFooterProps) => (
  <CardFooter
    className={cn('rounded-b-md border-t bg-secondary p-3!', className)}
    {...props}
  />
);

// Pre-styled flow nodes with minimal props for workflow/step usage.
export type FlowNodeVariant = 'workflow' | 'step';

export type FlowNodeCardProps = Omit<NodeProps, 'handles'> & {
  variant: FlowNodeVariant;
  title: string;
  subtitle?: string;
  meta?: string;
  children?: ReactNode;
  handles?: NodeHandles;
};

const variantStyles: Record<
  FlowNodeVariant,
  { accent: string; ring: string; label: string; defaultHandles: NodeHandles }
> = {
  workflow: {
    accent: 'rgba(37, 99, 235, 0.9)',
    ring: 'rgba(37, 99, 235, 0.35)',
    label: 'Workflow',
    defaultHandles: {
      source: true,
      sourcePosition: Position.Bottom,
    },
  },
  step: {
    accent: 'rgba(34, 197, 94, 0.9)',
    ring: 'rgba(34, 197, 94, 0.35)',
    label: 'Step',
    defaultHandles: {
      target: true,
      source: true,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    },
  },
};

export const FlowNodeCard = ({
  variant,
  title,
  subtitle,
  meta,
  children,
  handles,
  className,
  style: overrideStyle,
  ...props
}: FlowNodeCardProps) => {
  const theme = variantStyles[variant];
  const mergedHandles = { ...theme.defaultHandles, ...handles };

  return (
    <Node
      handles={mergedHandles}
      className={cn(
        'overflow-hidden border bg-card text-card-foreground shadow-sm',
        className
      )}
      style={{
        borderColor: theme.ring,
        boxShadow: `0 10px 25px -18px ${theme.ring}`,
        ...(overrideStyle ?? {}),
      }}
      {...props}
    >
      <div
        className="h-1.5 w-full"
        style={{ background: theme.accent }}
        aria-hidden
      />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold uppercase tracking-tight"
            style={{ color: theme.accent }}
          >
            {theme.label}
          </span>
          {meta ? (
            <span className="text-[10px] rounded-full border px-2 py-0.5 text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </div>
        <div className="text-base font-semibold leading-tight">{title}</div>
        {subtitle ? (
          <div className="text-xs text-muted-foreground break-all">
            {subtitle}
          </div>
        ) : null}
        {children}
      </div>
    </Node>
  );
};
