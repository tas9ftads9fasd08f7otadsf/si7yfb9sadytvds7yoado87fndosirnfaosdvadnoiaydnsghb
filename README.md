# mapeditor-fe

The map editor a sharing phone serves to browsers on its network. A Next.js static export that the
Riki Maps app ships inside itself; nothing here runs on a server.

## How it fits together

- One source builds two targets (rikimaps' `.planning/web-icloud.md`): the phone's page, the
  default, and the iCloud site, `RIKI_TARGET=web`. The store and screens ask `@backend`, which
  `next.config.ts` points at `src/targets/<target>/`; the other target is never bundled.
- `next build` writes a static export to `out/`. The page lives at `/`, its assets under `/web/app/`.
- `npm run pack` cuts that to `dist/WebEditor.bundle` and adds `web-editor.json` (the version, and
  what the app's tests hold a served style against) and the `Info.plist` an App Store upload expects.
- Every merge to `master` publishes the zip as a GitHub release. The app takes one with its
  `tools/update-web-editor.sh <tag>`, in a pull request of its own, so a build ships only once reviewed.
- At run time the page reads everything from the phone: `/web/words` for its language, `/web/session`
  for who is let in, `/riki/v1/*` for maps. With no phone's words it speaks English.

## Working on it

Node 24 (`.nvmrc`).

```sh
npm ci
npm run phone                 # the stand-in phone, on :8765 unless PORT says otherwise
PORT=8799 npm run phone & npm run dev
PHONE_URL=http://192.168.1.20:8765 npm run dev   # against a real phone
```

| Command | What it does |
|---|---|
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm test` | Vitest: logic, the store, components |
| `npm run build` | The phone's static export; `npm run build:web` the site's |
| `npm run test:e2e` | Playwright against the build and `e2e/mock-phone.mjs`; build first |
| `npm run pack` | The bundle and zip in `dist/` |
| `npm run check` | All of it, as CI runs it |

`e2e/console.spec.mjs` and `e2e/site-console.spec.mjs` open every screen, looking and editing, signed in and
out, and fail on any console error, thrown error or refused request, so neither a pull request nor a release
passes CI with one. The one exception is Apple's 421 to a signed-out visitor's sign-in check (`users/caller`).

`npm run real-region` downloads Bratislavský kraj from maptiles' `maps.json` into `e2e/real/`, and
`npm run phone:real` then opens the Riki Maps map over it first, drawn as the app draws it.

`BASE_URL=http://192.168.1.20:8765/ npx playwright test` runs the specs that need no `/__test` side
against a real phone.

## The site

`npm run build:web && npm run pack:web` writes `dist/web-site.zip`: the site's build under `out/`,
`index.php`, `Site.php` and `Regions.php`, `.htaccess`, `config.example.php` and `site.json`. Unpack it anywhere a web
server runs PHP 8.1 or later, at a domain's root or under a path, and send every request to `index.php`. Apache does
so by the zip's `.htaccess` (`mod_rewrite`, and `AllowOverride All` for the folder; no `RewriteBase`, so it works at a
root and under a path). nginx has no `.htaccess` and needs `try_files $uri /index.php;`; `php -S host:port index.php`
needs nothing. `config.php` is the one file tied to the address and is not in the zip: the deploy writes it
(below); by hand, copy `config.example.php` to `config.php`. The server only serves files:
`composer install --working-dir=server` and `npm run test:php` run its PHPUnit tests, and
`npm run test:e2e:web` runs the browser specs against the zip at `/` and under `/editor/`, with
`e2e/mock-cloud.mjs` standing in for CloudKit and `e2e/fake-core.mjs` for `riki-core.wasm`. The site's zip carries the
core only once `rikiCore.ref` in `package.json` pins a rikimaps commit: `npm run build:core` builds `riki-core.wasm` from
it (`RIKIMAPS_DIR` is a checkout of rikimaps at that commit, read only; the build writes `dist/riki-core/` here:
the module, its `.sha256` and its size). It runs rikimaps' documented swift build
(`tools/linux-core/wasm/README.md`, Swift 6.2 and its WebAssembly SDK, both checked against their pinned sums),
`wasm-opt -Oz` from the `binaryen` package, and loads the module as the site does, calling `riki_version`. The order is
`npm run build:core`, `npm run build:web`, `npm run pack:web`; until a commit is pinned `pack:web` says so and packs
without a core, and the deploy refuses such a zip unless it is run by hand for a test address (`without_core`). To
take a newer core, set `rikiCore.ref` to the rikimaps commit and `rikiCore.sha256` to the module's (the build prints
it, and refuses a module that is not the pinned one). `RIKI_CORE_REF=<sha>` tries a commit before it is pinned.
The site's words come from the same pin: `npm run build:words` (same `RIKIMAPS_DIR`) reads rikimaps' key list
(`web-words.json`) and the `<lang>.lproj` tables and writes `dist/words/<lang>.json` and `languages.json`, which `pack:web`
puts under `out/words/` (English alone, from the page's own sentences, while nothing is pinned; the contract is §2 of
rikimaps' `.planning/web-icloud.md`). The page takes the language `languages.json` offers for `navigator.languages`:
exact, then the language alone, `zh-TW`/`zh-HK` as `zh-Hant`, other `zh` as `zh-Hans`, `sr-Latn-*` as `sr-Latn`,
else English. `scripts/build-words.test.mjs` reproduces rikimaps' old generator's output at `5a7200c4fb` (hash
`c80d8253675b`) when `RIKIMAPS_WORDS_CHECK_DIR` is a checkout of it.
CI builds them in `.github/workflows/core.yml`, which `release.yml` calls before it packs; rikimaps is private, so the
repository secret `RIKIMAPS_READ_TOKEN` (a token that reads it) has to exist. With a commit pinned, `pack:web` fails
where the module was not built; `RIKI_PACK_WITHOUT_CORE=1` packs without it for the browser specs, which stand in for the
core (CI does, and `npm run check`).
`riki_people` (item 108) is the call that reads who holds a map, and the module pinned today lacks it, so the People
card answers "The site's map rules are not ready yet." until the pin moves to a commit that has it (then
`CONTRACT.calls` in `scripts/build-core.mjs` and `riki_version` list it). It takes `{rows, id}`, the rows being
those every call gets plus a shared map's `Share` row (a `cloudkit.share` record: its `cloudkit.title` and other text fields,
and `participants`, `owner`, `currentUserParticipant`, `publicPermission` as CloudKit answers them) and its
`SharedMapMember` rows (`participantID`, `roleRaw`, `displayName`, `addedAt`, `map`), and answers
`{shared, role, people: [{id, name, role, hasAccepted, isYou}], linkRole}` by `MapShareService`'s rules: owner for the
owner, reader for a read-only participant, else the member row's `roleRaw` (not owner), else editor; a member row keyed
`invite:<address>` is an invited person; `name` is null where neither CloudKit nor the row names them; people come in
`MapSharePeople.ordered`'s order; `linkRole` is reader or editor for a `publicPermission` of `READ_ONLY` or
`READ_WRITE`, else null. The `Share` and member rows of a map are those of its own zone.
A map the person shares is moved by Core Data into a private zone of its own, `com.apple.coredata.cloudkit.share.<UUID>`, so the site reads that zone beside the mirror zone and the shared database's.
Without Swift, run `.github/workflows/core-on-demand.yml` by hand (`gh workflow run core-on-demand.yml`, with
`-f ref=<rikimaps commit, branch or tag>` for another than the pin): it builds and tests the core and keeps
`dist/riki-core/` for 90 days as the artifact `riki-core-<commit>`. `npm run fetch:core` (or
`RIKI_CORE_REF=<40-character sha> npm run fetch:core`) downloads it with `gh` into `dist/riki-core/` and checks it as
a build is. It is not a release, since rikimaps takes the newest release as the editor's bundle.
The site's glyphs and base sprite (item 110) come from the same pin: `npm run build:assets` (same `RIKIMAPS_DIR`) copies the
checkout's `Resources/Glyphs` and `temaki-sprite{,@2x}.{json,png}` into `dist/assets/glyphs/<font stack>/<range>.pbf` (the
stack's folder named with spaces, as the app's `GlyphStore` places it) and `dist/assets/sprites/`, and `pack:web` puts them
under `out/`, where `index.php` serves them (`application/x-protobuf` for glyphs). `riki_style`'s catalog is
`{tilesBase, glyphsBase, spriteBase, theme, hidden, tiles}`: the core makes the style's `glyphs`
`<glyphsBase>/{fontstack}/{range}.pbf` and its `sprite` `<spriteBase>`, both absolute addresses of those files. A pinned
pack without them fails, as for the core, unless `RIKI_PACK_WITHOUT_CORE=1` (the specs put stand-ins in place), and the
deploy refuses such a zip like one without the core.

The API token (CloudKit Console, the container's API Access) needs two settings: **Sign-In Callback** set to
`postMessage`, and the site's origin (scheme, host and port) in its allowed origins, once per address. CloudKit JS keeps the sign-in in a cookie scoped to the page's path, so a site under `/editor/` and
its nested routes are worth checking in a real browser once, signing in on a nested screen and reloading it.

### Region packages (item 112)

A map whose style draws from Riki region data the browser does not hold says so over the map and in Edit map ("Download
Vysoké Tatry (263 MB) to see it on this map"); one tap fetches it. The browser never asks the packages' host itself: the
site's server is the one thing that fetches for it (the plan's "no relay", excepted for region packages only).

- **The server** (`server/Regions.php`, set up by `REGIONS_CATALOG`, an https address of maptiles' `maps.json`; unset, the routes
  answer 404 and the site offers no downloads). `GET <base>/regions/catalog.json` is the catalog, fetched by the server and
  kept in `cache/` beside the site for 15 minutes (asked again by its ETag, served stale when the host fails).
  `GET <base>/regions/file/<id>` streams that Drive file only if the id is a download id in the cached catalog, from
  `drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`; GET and HEAD only, a `Range` header of the
  form `bytes=N-M` passed on and nothing else of the browser's, a web page from the host (Drive's quota or confirmation page)
  or a size other than the catalog's refused as a 502 whose JSON says why. It needs PHP's `allow_url_fopen`. Google Drive may
  throttle or refuse heavy downloads ("quota exceeded"); the page then says the host did not give the package, and the
  person can try again.
- **The browser** takes each piece's zip (the app reads `.aar`, which a browser cannot), unpacks it as it arrives with
  fflate and keeps its files in the origin's private file system (`navigator.storage.getDirectory()`, IndexedDB where
  there is none), asking the browser once to keep them. A package counts once its mark is written; a newer catalog build
  (`updated_ts`) is offered as an update and replaces the older only when whole; Remove frees it. No download ends before
  its byte count is the catalog's, which is how a page of the host's is told from a package.
- **The core** says what a style needs. `riki_style`'s catalog gains `stored: [{region, piece, version, files, contents}]`
  (`contents` is the package's `contents.json` text), and the style it answers names the region data it would draw from
  and the browser lacks in `metadata["riki:needs"]: [{region, piece}]`, `region` being the catalog's key (the app's
  `regionId`) and `piece` the key under its `maps`. For a stored package the style's sources are
  `pmtiles://riki-store/<region>/<piece>/<path in the zip>` and its sprite sheets
  `riki-store://<region>/<piece>/<path without extension>` (paths unencoded), which the page reads from where it keeps them.
  The pinned module does not do this yet; until it does a style carries no needs and the site shows no offer.

### Deploying it

Every merge to `master` runs CI, publishes a release and then deploys that release's
`web-site.zip` to the PHP server over FTPS (`.github/workflows/deploy-site.yml`,
`scripts/deploy-site.sh`). Actions › Deploy site › Run workflow deploys any release again by tag.
No step is left to do on the server: every deploy writes `config.php` itself, from the settings below, and
replaces the one there. The deploy generates it with `php` (`var_export`, so no setting can end up as code; the
workflow installs `php-cli`) and refuses to deploy when `ICLOUD_API_TOKEN` is empty, naming it. The CloudKit
environment is always `production`; there is no setting for it. `TILES_BASE`, when set, must be an `https://`
URL (a trailing slash is dropped); the zip must not carry a `config.php` of its own.

Upload order: new assets and the page's `out/` first, then `Site.php`, `Regions.php`, `config.example.php` and `.htaccess`, then
`config.php` (sent as `config.php.new` and renamed, so no request reads half of it), then `index.php` and
`site.json`, then the assets no page names any more. A request reaches the new entry point last, so it never meets
new code without its config, and a failed config upload stops the deploy with the old `index.php` still serving.
Afterwards the deploy reads `site.json` and `config.php` back and compares them.

Set it up once in Settings › Environments › `site`:

| Name | Kind | What |
|---|---|---|
| `FTPS_HOST` | secret | the server's host name |
| `FTPS_USER` | secret | the FTP account |
| `FTPS_PASSWORD` | secret | its password |
| `FTPS_DIR` | variable | the site's folder on the server, `/` when unset |
| `FTPS_PORT` | variable | `21` when unset (explicit FTPS) |
| `FTPS_CERT_NAME` | variable | a name the server's certificate holds, accepted in place of `FTPS_HOST`; `*.r5.websupport.sk` when unset |
| `ICLOUD_API_TOKEN` | variable (a secret works too) | the container's CloudKit JS API token; every browser sends it, so it is no secret; required |
| `ICLOUD_CONTAINER` | variable | `iCloud.com.rikimaps.rikimaps.maps` when unset |
| `TILES_BASE` | variable | the maptiles host, `https://…`; optional, and without it Riki's own region maps do not draw |
| `SITE_URL` | variable | the site's address, whose `site.json` the server check reads; optional |
| `REGIONS_CATALOG` | variable | the region catalog (maptiles' `maps.json`), `https://…`; optional, and without it the site offers no region downloads |
| `RIKIMAPS_READ_TOKEN` | repository secret | reads the private rikimaps repository for the core and the words; the release build, not the deploy |

Until the three FTPS secrets are set, the deploy job says so and skips. The server's certificate must
be signed by a trusted authority and issued for `FTPS_HOST` or `FTPS_CERT_NAME`: shared hosting shows one
certificate for every site on the server, which never names the site's own host. Add required reviewers to the `site` environment to approve each
deploy by hand.

#### Checking the server

`.github/workflows/check-server.yml` runs `scripts/check-server.sh` each morning, by hand (Actions › Check
server › Run workflow), and as the deploy's step before it uploads anything. It checks, in order: that
`FTPS_HOST` resolves, that `FTPS_PORT` answers, that the certificate is issued for `FTPS_HOST` or `FTPS_CERT_NAME`
(naming the names it does hold when not), trusted and not expiring within 14 days (a warning), that `FTPS_USER` logs in
and can write and remove a file in `FTPS_DIR`, and, with `SITE_URL` set, which release the site serves (a warning when it serves none). Each
line reads `ok`, `warn`, `skip` or `FAIL`, and any `FAIL` fails the run, so GitHub mails it. Locally, with the
same variables set: `bash scripts/check-server.sh`.

What stays in CloudKit Console, for the container: Web Services on for it; the API token's **Sign-In Callback** set
to `postMessage` and the site's origin (scheme, host and port) among its allowed origins; the schema deployed to
Production, since the site always uses it.

## Layout

- `src/app`: the root layout, the one page, the stylesheet.
- `src/components`: the page in React; `edit/` is Edit map, `ui/` the small shared parts.
- `src/store/viewer.ts`: all state; it asks `@backend`, never `fetch`.
- `src/backend/types.ts`: the `Backend` every target answers; `src/lib/edit.ts`, the edits it takes.
- `src/targets/phone`: today's calls to the phone. `src/targets/web`: the site's: `config.ts`, `cloud.ts` (CloudKit JS, sign-in), `zones.ts` and
  `records.ts` (the zones' rows, kept in IndexedDB), `writes.ts` (a change saved with its change tags), `core.ts`
  (`riki-core.wasm`) and `backend.ts`. It reads and edits a map; the other writes wait for later steps.
- `server`: the site's `index.php`, `Site.php`, `Regions.php` and their PHPUnit tests.
- `src/map`: MapLibre, loaded on the client after the phone's words.
- `src/lib`: logic with no framework in it.
- `e2e`: browser specs and the stand-in phone, which must answer as the app's `PeerRouter` does.

MapLibre stays on 4.7.1 until an upgrade is checked against what the phone serves: one unknown
layer type or property stops a whole style loading (`src/lib/drawable.ts`).
