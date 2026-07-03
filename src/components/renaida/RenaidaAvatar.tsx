/**
 * Renaida — assistant avatar built from the Skåra mark (the Renofine logo disc
 * with a carved notch that becomes a single expressive eye). Pure SVG + CSS
 * keyframes (renaida.css); no image assets. Ported 1:1 from the design handoff
 * (Design Test/2026/07/03/design_handoff_renaida). All loop animations are
 * behind prefers-reduced-motion.
 */
import "./renaida.css";

export type RenaidaState = "idle" | "hello" | "think" | "talk" | "guide" | "happy" | "sleep";
export type RenaidaLook =
  | "center" | "up" | "down" | "left" | "right" | "upleft" | "upright" | "downright";

const RN_SKARA_PATH = "M32 6 a26 26 0 1 0 26 26 h-12 v-14 h-14 z";

// Where the pupil sits for each gaze direction (socket centre ≈ 39,25)
const RN_LOOK: Record<RenaidaLook, [number, number]> = {
  center: [39, 25],
  up: [39, 22],
  down: [39, 27.5],
  left: [36.5, 25],
  right: [42, 25],
  upleft: [36.5, 22],
  upright: [42, 22],
  downright: [42, 27],
};

interface RenaidaAvatarProps {
  size?: number;
  state?: RenaidaState;
  look?: RenaidaLook;
  headColor?: string;
  socketColor?: string;
  pupilColor?: string;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}

export function RenaidaAvatar({
  size = 160,
  state = "idle",
  look = "center",
  headColor = "#2F5D4E",
  socketColor = "#FAFAF7",
  pupilColor = "#1A1A17",
  className = "",
  style = {},
  "aria-hidden": ariaHidden,
}: RenaidaAvatarProps) {
  const [px, py] = RN_LOOK[look] || RN_LOOK.center;
  const closed = state === "happy" || state === "sleep";

  return (
    <svg
      className={`rn rn--${state} ${className}`}
      width={size}
      height={size}
      viewBox="-12 -12 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      role="img"
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : `Renaida (${state})`}
    >
      {/* soft ground shadow */}
      <ellipse className="rn-shadow" cx="32" cy="60" rx="20" ry="4" fill="rgba(26,26,23,0.10)" />

      {/* head + eye — this group nods / tilts */}
      <g className="rn-head">
        <path d={RN_SKARA_PATH} fill={headColor} />

        {/* eye socket (the carved fals), rounded a touch for character */}
        <rect className="rn-socket" x="32.5" y="18.5" width="13" height="13" rx="3" fill={socketColor} />

        {/* open eye: pupil that blinks + gazes */}
        {!closed && (
          <g className="rn-eye">
            <circle className="rn-pupil" cx={px} cy={py} r="3.9" fill={pupilColor} />
            <circle className="rn-glint" cx={px + 1.4} cy={py - 1.4} r="1.1" fill={socketColor} />
          </g>
        )}

        {/* happy: upward ^ curve */}
        {state === "happy" && (
          <path className="rn-curve" d="M35 27 q4 -4.5 8.5 0" stroke={pupilColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        )}
        {/* sleep: gentle closed lid */}
        {state === "sleep" && (
          <path className="rn-curve" d="M35 24.5 q4 3.5 8.5 0" stroke={pupilColor} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        )}
      </g>

      {/* thinking dots */}
      <g className="rn-dots">
        <circle cx="48" cy="4" r="2.4" fill={headColor} />
        <circle cx="56" cy="1" r="2.4" fill={headColor} />
        <circle cx="64" cy="3" r="2.4" fill={headColor} />
      </g>

      {/* talking sound arcs */}
      <g className="rn-sound" stroke={headColor} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M54 22 q5 4 0 10" />
        <path d="M60 18 q9 8 0 20" />
      </g>

      {/* sparkles for hello / happy */}
      <g className="rn-spark" fill={headColor}>
        <path className="rn-spark-a" d="M58 8 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 z" />
        <path className="rn-spark-b" d="M6 24 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1 z" />
      </g>

      {/* zzz for sleep */}
      <g className="rn-zzz" fill={headColor} style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
        <text className="rn-z1" x="50" y="8" fontSize="7">z</text>
        <text className="rn-z2" x="58" y="3" fontSize="9">z</text>
      </g>
    </svg>
  );
}
