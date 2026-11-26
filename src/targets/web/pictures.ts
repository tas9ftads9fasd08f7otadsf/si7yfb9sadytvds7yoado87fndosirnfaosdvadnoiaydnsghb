/** The phone's `PictureSize`: an icon's side, the most it may weigh, and a preview's frame. */
export const ICON_SIDE = 132;
export const ICON_BYTES = 250_000;
export const PREVIEW = { width: 720, height: 540 };
const JPEG_QUALITY = 0.85;

export type PictureKind = "icon" | "preview" | "styleIcon";

interface Size {
  width: number;
  height: number;
}

/** The part of the source drawn, and the size it is drawn at. */
export interface Cut {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  width: number;
  height: number;
}

/** What draws: the browser's canvas, or a test's stand-in. */
export interface Painter<Source> {
  open(picture: Blob): Promise<(Size & { source: Source }) | null>;
  paint(source: Source, cut: Cut, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob>;
}

/** The middle of the source in the target's shape; drawn at the target, or smaller when `enlarges` is off. */
export function cutOf(source: Size, target: Size, enlarges: boolean): Cut {
  const shape = target.width / target.height;
  const sw = Math.min(source.width, source.height * shape);
  const sh = sw / shape;
  const shrinks = enlarges ? 1 : Math.min(1, sw / target.width);
  return {
    sx: (source.width - sw) / 2,
    sy: (source.height - sh) / 2,
    sw,
    sh,
    width: Math.round(target.width * shrinks),
    height: Math.round(target.height * shrinks),
  };
}

/** A picture as the phone stores it: a square icon, as PNG unless too heavy, or a JPEG preview; null if unreadable. */
export async function sizedPicture<Source>(
  kind: PictureKind,
  picture: Blob,
  painter: Painter<Source>,
): Promise<Blob | null> {
  const opened = await painter.open(picture);
  if (!opened) return null;
  if (kind === "preview") {
    return painter.paint(opened.source, cutOf(opened, PREVIEW, false), "image/jpeg", JPEG_QUALITY);
  }
  const cut = cutOf(opened, { width: ICON_SIDE, height: ICON_SIDE }, true);
  const png = await painter.paint(opened.source, cut, "image/png");
  return png.size <= ICON_BYTES ? png : painter.paint(opened.source, cut, "image/jpeg", JPEG_QUALITY);
}

/** The browser's own decoding and canvas. */
export const canvasPainter: Painter<ImageBitmap> = {
  async open(picture) {
    try {
      const source = await createImageBitmap(picture);
      return { width: source.width, height: source.height, source };
    } catch {
      return null;
    }
  },
  async paint(source, cut, type, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = cut.width;
    canvas.height = cut.height;
    canvas.getContext("2d")?.drawImage(source, cut.sx, cut.sy, cut.sw, cut.sh, 0, 0, cut.width, cut.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The canvas made no picture"))), type, quality),
    );
  },
};

/** Bytes as the base64 CloudKit's web services carry. */
export async function base64Of(picture: Blob): Promise<string> {
  const bytes = new Uint8Array(await picture.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}
