/**
 * A tiny drawing of a project's floor plan, for the address timeline (S6).
 *
 * Its job is recognition, not detail: at this size the shape of the home is
 * what a person reads, and it answers "which of these renovations already has
 * a drawing I can start from?" without opening any of them.
 *
 * Rendered from the same coordinates the canvas uses (millimetres), scaled to
 * fit — no image is stored, so it can never go stale against the real plan.
 */

interface PlanGeometry {
  rooms: { points: { x: number; y: number }[]; color: string | null }[];
  walls: { x1: number; y1: number; x2: number; y2: number }[];
}

interface Props {
  plan: PlanGeometry;
  className?: string;
}

const WIDTH = 56;
const HEIGHT = 44;
const PADDING = 3;

export function PlanThumbnail({ plan, className }: Props) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const room of plan.rooms) {
    for (const p of room.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  for (const wall of plan.walls) {
    xs.push(wall.x1, wall.x2);
    ys.push(wall.y1, wall.y2);
  }
  if (xs.length === 0) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // One scale for both axes so the home keeps its proportions.
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2;
  const offsetY = (HEIGHT - spanY * scale) / 2;

  const px = (x: number) => (x - minX) * scale + offsetX;
  const py = (y: number) => (y - minY) * scale + offsetY;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-hidden="true"
    >
      {plan.rooms.map((room, i) => (
        <polygon
          key={`r${i}`}
          points={room.points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
          fill={room.color ?? 'currentColor'}
          fillOpacity={0.35}
          stroke="none"
        />
      ))}
      {plan.walls.map((wall, i) => (
        <line
          key={`w${i}`}
          x1={px(wall.x1)}
          y1={py(wall.y1)}
          x2={px(wall.x2)}
          y2={py(wall.y2)}
          stroke="currentColor"
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
