import type { ReactNode } from "react";

interface ShotProps {
  src?: string | null;
  alt?: string;
  ratio?: string;
  radius?: number;
  chrome?: boolean;
  fit?: "cover" | "contain";
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Shot({
  src,
  alt = "",
  ratio = "4/3",
  radius = 12,
  chrome = true,
  fit = "cover",
  children,
  className = "",
  onClick,
}: ShotProps) {
  return (
    <div className={`relative ${className}`}>
      <div
        className={onClick ? "cursor-pointer" : ""}
        onClick={onClick}
        style={{
          aspectRatio: ratio,
          borderRadius: radius,
          overflow: "hidden",
          border: "1px solid var(--lp-hairline)",
          background: "var(--lp-surface)",
          boxShadow: "var(--lp-shadow-md)",
          transition: "box-shadow 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (onClick) e.currentTarget.style.boxShadow = "var(--lp-shadow-lg)";
        }}
        onMouseLeave={(e) => {
          if (onClick) e.currentTarget.style.boxShadow = "var(--lp-shadow-md)";
        }}
      >
        {chrome && (
          <div
            className="flex items-center gap-1.5"
            style={{
              height: 28,
              padding: "0 12px",
              borderBottom: "1px solid var(--lp-hairline)",
              background: "var(--lp-bg-sunken)",
            }}
          >
            <span className="rounded-full" style={{ width: 10, height: 10, background: "oklch(78% 0.12 30)" }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: "oklch(85% 0.13 90)" }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: "oklch(75% 0.12 145)" }} />
            <span
              className="ml-auto"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 9,
                color: "var(--lp-fg-subtle)",
                letterSpacing: "0.05em",
              }}
            >
              renofine.com / projekt
            </span>
          </div>
        )}
        {src ? (
          // WebP forst, originalet som reserv. Skarmbilderna vagde 1 646 kB pa
          // landningssidan — fyra ganger fler pixlar an de visades i, i ett
          // format som inte komprimerar skarmbilder sarskilt bra. 82 % av
          // trafiken ar mobil.
          //
          // `loading="lazy"` for att varenda Shot ligger under vecket: de
          // hamtas nar man scrollar dit, inte fore forsta malningen.
          <picture>
            <source srcSet={src.replace(/\.(png|jpe?g)$/i, ".webp")} type="image/webp" />
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block w-full"
              style={{
                height: chrome ? "calc(100% - 28px)" : "100%",
                objectFit: fit,
                objectPosition: "top left",
              }}
            />
          </picture>
        ) : (
          <div
            className="flex items-center justify-center w-full"
            style={{
              height: chrome ? "calc(100% - 28px)" : "100%",
              background: `repeating-linear-gradient(45deg, var(--lp-surface-2) 0 8px, var(--lp-bg-sunken) 8px 16px)`,
              color: "var(--lp-fg-subtle)",
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              letterSpacing: "0.02em",
            }}
          >
            {alt || "skärmbild"}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
