export type Source = "phone" | "other";
export type Speeds = Record<Source, number>;

export const TRAFFIC_CHANNEL = "riki-traffic";
const WINDOW = 3000;

/** Bytes a second from each side, averaged over the last few seconds. */
export class Meter {
  private taken: { at: number; source: Source; bytes: number }[] = [];

  add(source: Source, bytes: number, at = Date.now()) {
    if (bytes > 0) this.taken.push({ at, source, bytes });
  }

  speeds(at = Date.now()): Speeds {
    this.taken = this.taken.filter((each) => at - each.at < WINDOW);
    const sum = (source: Source) => this.taken.reduce((total, each) => each.source === source ? total + each.bytes : total, 0);
    return { phone: Math.round(sum("phone") / (WINDOW / 1000)), other: Math.round(sum("other") / (WINDOW / 1000)) };
  }
}

/** The phone is where the page came from; everything else is another source. */
export function sourceOf(url: string, page: string): Source {
  try {
    return new URL(url, page).origin === new URL(page).origin ? "phone" : "other";
  } catch {
    return "other";
  }
}

export function speedText(bytesPerSecond: number): string {
  const kilobytes = bytesPerSecond / 1000;
  if (kilobytes >= 1000) return `${(kilobytes / 1000).toFixed(1)} MB/s`;
  return `${Math.round(kilobytes)} KB/s`;
}

interface Fetching {
  fetch: typeof fetch;
}

/** Tells the channel each answer's bytes; run as text in MapLibre's workers, so it uses nothing outside itself. */
export function countFetches(scope: Fetching, channelName: string) {
  const channel = new BroadcastChannel(channelName);
  const plain = scope.fetch;
  scope.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    return plain.call(scope, input, init).then(function (answer: Response) {
      const url = answer.url || String(input instanceof Request ? input.url : input);
      const length = Number(answer.headers.get("content-length"));
      if (length > 0) {
        channel.postMessage({ url: url, bytes: length });
      } else if (answer.body) {
        answer.clone().arrayBuffer().then(
          function (body: ArrayBuffer) { channel.postMessage({ url: url, bytes: body.byteLength }); },
          function () { /* an answer cut short carried nothing to count */ });
      }
      return answer;
    });
  } as typeof fetch;
}

/** A script for a worker that counts its fetches as the page counts its own. */
export function workerCounter(): string {
  const text = `(${countFetches.toString()})(self, ${JSON.stringify(TRAFFIC_CHANNEL)});`;
  return URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
}

let counting = false;

/** Counts the page's and the map workers' downloads, and tells the speeds each second they change. */
export function watchTraffic(told: (speeds: Speeds) => void): () => void {
  if (!counting) {
    countFetches(window, TRAFFIC_CHANNEL);
    counting = true;
  }
  const meter = new Meter();
  const channel = new BroadcastChannel(TRAFFIC_CHANNEL);
  channel.onmessage = (event: MessageEvent<{ url: string; bytes: number }>) => {
    meter.add(sourceOf(event.data.url, location.href), event.data.bytes);
  };
  let last = "";
  const timer = setInterval(() => {
    const speeds = meter.speeds();
    const key = `${speeds.phone}/${speeds.other}`;
    if (key === last) return;
    last = key;
    told(speeds);
  }, 1000);
  return () => {
    clearInterval(timer);
    channel.close();
  };
}
