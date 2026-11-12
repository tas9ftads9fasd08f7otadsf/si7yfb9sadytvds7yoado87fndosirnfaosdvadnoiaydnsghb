"use client";

import { speedText } from "@/lib/traffic";
import { useViewer } from "@/store/viewer";
import { Sym } from "./ui/Sym";

/** What is arriving now: through the phone, and straight from other sources. */
export function Traffic() {
  const words = useViewer((state) => state.words);
  const traffic = useViewer((state) => state.traffic);
  if (!traffic) return null;
  const phone = speedText(traffic.phone);
  const other = speedText(traffic.other);
  const said = `${words.fromPhone}: ${phone} · ${words.fromElsewhere}: ${other}`;
  return (
    <span id="traffic" role="group" title={said} aria-label={said}>
      <Sym name="iphone" /><span id="trafficPhone">{phone}</span>
      <Sym name="globe" /><span id="trafficOther">{other}</span>
    </span>
  );
}
