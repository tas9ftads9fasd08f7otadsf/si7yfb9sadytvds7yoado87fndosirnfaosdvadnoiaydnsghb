import { Sym } from "./Sym";
import { ground } from "./ground";

interface Props {
  symbol?: string | null;
  tint?: string | null;
  small?: boolean;
  picture?: string | null;
  /** Its picture is still being read. */
  pending?: boolean;
}

export function MarkTile({ symbol, tint, small, picture, pending }: Props) {
  const style = { ...ground(tint), ...(picture ? { backgroundImage: `url("${picture}")` } : {}) };
  const name = `mark${small ? " small" : ""}${pending ? " pending" : ""}`;
  return <span className={name} style={style}>{picture ? null : <Sym name={symbol} />}</span>;
}
