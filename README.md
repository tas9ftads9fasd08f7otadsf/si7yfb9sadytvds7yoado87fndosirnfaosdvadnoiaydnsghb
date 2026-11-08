# mapeditor-fe

The map editor a sharing phone serves to browsers on its network. A Next.js static export that the
Riki Maps app ships inside itself; nothing here runs on a server.

## How it fits together

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
| `npm run build` | The static export |
| `npm run test:e2e` | Playwright against the build and `e2e/mock-phone.mjs`; build first |
| `npm run pack` | The bundle and zip in `dist/` |
| `npm run check` | All of it, as CI runs it |

`BASE_URL=http://192.168.1.20:8765/ npx playwright test` runs the specs that need no `/__test` side
against a real phone.

## Layout

- `src/app`: the root layout, the one page, the stylesheet.
- `src/components`: the page in React; `edit/` is Edit map, `ui/` the small shared parts.
- `src/store/viewer.ts`: all state and every call to the phone.
- `src/map`: MapLibre, loaded on the client after the phone's words.
- `src/lib`: logic with no framework in it.
- `e2e`: browser specs and the stand-in phone, which must answer as the app's `PeerRouter` does.

MapLibre stays on 4.7.1 until an upgrade is checked against what the phone serves: one unknown
layer type or property stops a whole style loading (`src/lib/drawable.ts`).
