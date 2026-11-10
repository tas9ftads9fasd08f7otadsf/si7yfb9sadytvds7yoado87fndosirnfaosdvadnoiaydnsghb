import type { MouseEvent, ReactNode } from "react";
import { type Route, pathOf } from "@/lib/route";
import { go } from "@/store/viewer";

interface Props {
  to: Route;
  id?: string;
  className?: string;
  current?: boolean;
  title?: string;
  role?: string;
  onFollow?: () => void;
  children: ReactNode;
}

/** A real link, so it opens in a new tab; a plain click moves without asking for a page. */
export function Link({ to, id, className, current, title, role, onFollow, children }: Props) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (onFollow) onFollow();
    else go(to);
  };
  return (
    <a href={pathOf(to)} id={id} className={className} title={title} role={role}
      aria-current={current ? "page" : undefined}
      onClick={follow}>{children}</a>
  );
}
