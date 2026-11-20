// 123 What a page may not do: log an error, throw, or be refused a file it asked for.
// Apple answers its own sign-in check with 421 for anyone signed out; the library asks it to draw the button.
const signedOutCheck = (url, status) => status === 421 && new URL(url).pathname.endsWith("/users/caller");

export function watchConsole(page) {
  const found = [];
  let where = "";
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/status of 421/.test(message.text()) && signedOutCheck(message.location().url, 421)) return;
    found.push(`${where}: console: ${message.text()}`);
  });
  page.on("pageerror", (error) => found.push(`${where}: thrown: ${error.message}`));
  page.on("response", (answer) => {
    if (answer.status() >= 400 && !signedOutCheck(answer.url(), answer.status())) found.push(`${where}: ${answer.status()} ${answer.request().method()} ${answer.url()}`);
  });
  page.on("requestfailed", (request) => {
    // Leaving a page cuts its open requests short; that is the browser, not the page.
    if (request.failure()?.errorText !== "net::ERR_ABORTED") found.push(`${where}: failed ${request.url()}`);
  });
  return {
    found,
    async visit(address) {
      where = address;
      await page.goto(address);
      await page.waitForLoadState("networkidle");
    }
  };
}

/** Every screen's address on a map, as `route.ts` reads them. */
export const screensOf = (map, layer) => ["/", "/maps", `/maps/${map}`, `/maps/${map}/layers`,
  `/maps/${map}/edit/layers`, `/maps/${map}/edit/general`, `/maps/${map}/edit/styling`, `/maps/${map}/edit/sharing`,
  `/maps/${map}/edit/offline`, `/maps/${map}/layers/${layer}/details`, `/maps/${map}/layers/new/tile`,
  `/maps/${map}/layers/new/server`, `/maps/${map}/search/Chata`, "/new", "/data/layers", "/data/servers",
  "/data/regions", "/settings"];
