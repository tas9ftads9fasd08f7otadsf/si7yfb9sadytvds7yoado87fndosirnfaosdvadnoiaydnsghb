/** Only where the app runs: an iPhone, or an iPad, which may say it is a Mac. */
export function opensTheApp(agent: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1);
}

export const APP_LINK = "rikimaps://open";

/** 179 Kept for the tab, so a closed offer stays closed until the browser is. */
export const APP_OFFER_CLOSED_KEY = "riki-app-offer-closed";
