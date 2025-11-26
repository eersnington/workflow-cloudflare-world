import {
  BaseEdge,
  type EdgeProps,
  getStraightPath,
} from '@xyflow/react';

const Temporary = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) => {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <BaseEdge
      className="stroke-1"
      id={id}
      path={edgePath}
      style={{
        strokeDasharray: '6 6',
        stroke: 'var(--muted-foreground)',
      }}
    />
  );
};

const Animated = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
}: EdgeProps) => {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge
        id={id}
        markerEnd={markerEnd}
        path={edgePath}
        style={{
          strokeWidth: 2.5,
          stroke: style?.stroke ?? 'var(--primary)',
          strokeLinecap: 'round',
          ...style,
        }}
      />
      <circle
        r="4"
        fill={style?.stroke ?? 'var(--primary)'}
        opacity={0.9}
      >
        <animateMotion dur="1.8s" path={edgePath} repeatCount="indefinite" />
      </circle>
    </>
  );
};

export const Edge = {
  Temporary,
  Animated,
};
