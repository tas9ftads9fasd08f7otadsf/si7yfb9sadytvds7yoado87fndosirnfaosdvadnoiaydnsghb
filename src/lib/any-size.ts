/** 131: `?debug=1` lets any window draw the page, for a day; `?debug=0` ends it sooner. */
export const ANY_SIZE_KEY = "riki-any-size-until";
export const ANY_SIZE_FOR = 24 * 60 * 60 * 1000;

/** Until when the size is not checked, given the address's query and what the browser kept. */
export function anySizeUntil(search: string, kept: string | null, now: number): number | null {
  const asked = new URLSearchParams(search).get("debug");
  if (asked === "1") return now + ANY_SIZE_FOR;
  if (asked === "0") return null;
  const until = Number(kept);
  return Number.isFinite(until) && until > now ? until : null;
}

/** Before the first paint, so a small window never flashes the notice; `anySizeUntil` written out. */
export const ANY_SIZE_SCRIPT = `try{var q=new URLSearchParams(location.search).get("debug"),n=Date.now(),`
  + `k=Number(localStorage.getItem("${ANY_SIZE_KEY}")),`
  + `u=q==="1"?n+${ANY_SIZE_FOR}:q==="0"?0:(isFinite(k)&&k>n?k:0);`
  + `if(u){localStorage.setItem("${ANY_SIZE_KEY}",String(u));document.documentElement.dataset.anySize="1"}`
  + `else localStorage.removeItem("${ANY_SIZE_KEY}")}catch(e){}`;

export const isAnySize = () => typeof document !== "undefined" && document.documentElement.dataset.anySize === "1";

/** Only where the app runs: an iPhone, or an iPad, which may say it is a Mac. */
export function opensTheApp(agent: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1);
}

export const APP_LINK = "rikimaps://open";
