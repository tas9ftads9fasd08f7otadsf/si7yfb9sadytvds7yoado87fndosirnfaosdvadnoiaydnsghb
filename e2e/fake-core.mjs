// A stand-in for riki-core.wasm: the same exports and buffers, each call answering what was recorded.
// RikiCore is built in rikimaps; the site never carries this, only tests do.

const u = (n) => {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const s = (n) => {
  const out = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && !(b & 0x40)) || (n === -1 && b & 0x40)) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
};
const text = (t) => {
  const b = [...new TextEncoder().encode(t)];
  return [...u(b.length), ...b];
};
const vec = (items) => [...u(items.length), ...items.flat()];
const section = (id, body) => [id, ...u(body.length), ...body];

const FIRST_ANSWER = 1024;
const HEAP = 1 << 18;
const PAGES = 16;

/** The module's bytes: `answers` holds what each export returns; a call with none refuses. */
export function fakeCoreWasm(answers) {
  const names = [
    "riki_maps",
    "riki_map",
    "riki_apply",
    "riki_style",
    "riki_changes",
    "riki_read_address",
    "riki_add_layer",
    "riki_people",
    "riki_switches",
    "riki_export",
    "riki_duplicate",
    "riki_shelve",
    "riki_delete",
    "riki_new_map",
    "riki_import",
    "riki_packages",
    "riki_copies",
    "riki_esri_services",
    "riki_road_signs",
    "riki_read_tiles",
    "riki_version",
  ];
  const bodies = names.map((name) => {
    const bytes = [
      ...new TextEncoder().encode(JSON.stringify(answers[name] ?? { refused: `${name} has no recorded answer` })),
    ];
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length, true);
    return [...length, ...bytes];
  });
  const at = [];
  let next = FIRST_ANSWER;
  for (const body of bodies) {
    at.push(next);
    next += body.length;
  }
  if (next > HEAP) throw new Error("recorded answers are too large for the stand-in core");

  const types = section(
    1,
    vec([
      [0x60, ...vec([[0x7f]]), ...vec([[0x7f]])],
      [0x60, ...vec([[0x7f], [0x7f]]), 0x00],
      [0x60, ...vec([[0x7f], [0x7f]]), ...vec([[0x7f]])],
    ]),
  );
  const functions = section(3, vec([[0], [1], ...names.map(() => [2])]));
  const memory = section(5, vec([[0x00, ...u(PAGES)]]));
  const globals = section(6, vec([[0x7f, 0x01, 0x41, ...s(HEAP), 0x0b]]));
  const exported = [
    ["memory", 0x02, 0],
    ["riki_alloc", 0x00, 0],
    ["riki_free", 0x00, 1],
    ...names.map((name, index) => [name, 0x00, 2 + index]),
  ];
  const exports = section(7, vec(exported.map(([name, kind, index]) => [...text(name), kind, ...u(index)])));
  const body = (code) => [...u(code.length), ...code];
  const code = section(
    10,
    vec([
      body([0x00, 0x23, 0x00, 0x23, 0x00, 0x20, 0x00, 0x6a, 0x24, 0x00, 0x0b]),
      body([0x00, 0x0b]),
      ...at.map((address) => body([0x00, 0x41, ...s(address), 0x0b])),
    ]),
  );
  const data = section(
    11,
    vec(bodies.map((bytes, index) => [0x00, 0x41, ...s(at[index]), 0x0b, ...u(bytes.length), ...bytes])),
  );
  return Uint8Array.from([
    0x00,
    0x61,
    0x73,
    0x6d,
    0x01,
    0x00,
    0x00,
    0x00,
    ...types,
    ...functions,
    ...memory,
    ...globals,
    ...exports,
    ...code,
    ...data,
  ]);
}
