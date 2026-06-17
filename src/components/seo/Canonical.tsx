import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const CANONICAL_ORIGIN = "https://renofine.com";

/**
 * Emits a self-referencing canonical <link> pointing at the apex domain for the
 * current path. The host is hardcoded to the apex on purpose: duplicate hosts
 * that serve the same SPA (www.renofine.com, renomate.pages.dev,
 * letsrenomate.com) then all declare renofine.com as canonical, so Google
 * consolidates them instead of flagging "Duplicate without user-selected
 * canonical". Updates on every route change.
 */
export function Canonical() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Clean canonical URL: no query/hash, strip trailing slash except root.
    const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
    const href = `${CANONICAL_ORIGIN}${path}`;

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [pathname]);

  return null;
}
