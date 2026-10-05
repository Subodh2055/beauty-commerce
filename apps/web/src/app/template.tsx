import { ViewTransition } from "react";

/**
 * Route transitions. A template re-mounts on every navigation (a layout
 * wouldn't), so this ViewTransition sees each page leave and the next arrive:
 * a quick fade-down out, a gentle rise in (CSS in globals.css, `.page-*`).
 * Search-param changes (shop filters) keep the same page and don't animate.
 * Uses the browser View Transitions API; unsupported browsers just swap.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
