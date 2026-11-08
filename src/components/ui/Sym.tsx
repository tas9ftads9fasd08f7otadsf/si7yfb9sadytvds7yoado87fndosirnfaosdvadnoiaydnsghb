import type { CSSProperties } from "react";
import { symbolURL } from "@/lib/phone";

/** A symbol the phone draws, laid on as a mask so it takes the text's colour. */
export function Sym({ name, className }: { name?: string | null; className?: string }) {
  return <i className={className ? `sym ${className}` : "sym"} aria-hidden="true"
    style={{ "--sym": symbolURL(name) } as CSSProperties} />;
}
