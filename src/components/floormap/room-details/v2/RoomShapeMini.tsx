interface Point {
  x: number;
  y: number;
}

interface RoomShapeMiniProps {
  points?: Point[] | null;
  color?: string;
  size?: number;
  stroke?: number;
}

export function RoomShapeMini({ points, color = "#2F5D4E", size = 36, stroke = 1.25 }: RoomShapeMiniProps) {
  if (!points || points.length < 3) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: "var(--rf-bg-sunken)",
          border: "1px dashed var(--rf-hairline)",
        }}
      />
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const pad = 6;
  const sc = (size - pad * 2) / Math.max(w, h);
  const offX = pad + ((Math.max(w, h) - w) / 2) * sc;
  const offY = pad + ((Math.max(w, h) - h) / 2) * sc;

  const d =
    points
      .map((p, i) => {
        const x = (p.x - minX) * sc + offX;
        const y = (p.y - minY) * sc + offY;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + "Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path
        d={d}
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
    </svg>
  );
}
