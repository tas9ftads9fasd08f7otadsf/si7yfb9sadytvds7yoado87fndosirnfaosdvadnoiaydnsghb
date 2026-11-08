import { Sym } from "./Sym";
import { ground } from "./ground";

interface Props {
  symbol?: string | null;
  tint?: string | null;
  small?: boolean;
  picture?: string | null;
}

export function MarkTile({ symbol, tint, small, picture }: Props) {
  const style = { ...ground(tint), ...(picture ? { backgroundImage: `url("${picture}")` } : {}) };
  return <span className={small ? "mark small" : "mark"} style={style}>{picture ? null : <Sym name={symbol} />}</span>;
}
