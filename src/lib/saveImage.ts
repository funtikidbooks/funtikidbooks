// Saving a chat picture on whatever the person is holding (sếp Phúc, 27/11:
// "các bạn gửi hình ảnh nhưng trên điện thoại không download về được" — the
// full-screen viewer had no way to save, and a long-press on a chat photo is
// switched off for every button on the site).
//
// iPhone/iPad: the share sheet, whose "Lưu hình ảnh" puts it straight into
// Photos (a plain download only lands in the Files app). Android and
// computers: an ordinary download.

const PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/";

const EXT_OF_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tif",
  "image/svg+xml": "svg",
};
const IMAGE_EXTS = new Set([...Object.values(EXT_OF_TYPE), "jpeg", "tiff", "jfif"]);

// An iPad on iPadOS calls itself a Mac, but it has a touch screen.
export function isAppleTouch(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

// The name the saved file gets: the one it was sent under (else the one in
// the link), with the extension matching what is really inside — some
// uploads are WebP under a .jpg name, and Photos is picky about that.
export function saveName(url: string, filename: string | null | undefined, type?: string): string {
  let name = (filename ?? "").trim();
  if (!name) {
    const last = url.split(/[?#]/)[0].split("/").pop() ?? "";
    try {
      name = decodeURIComponent(last);
    } catch {
      name = last;
    }
  }
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/^\.+/, "") || "anh";
  const ext = EXT_OF_TYPE[(type ?? "").split(";")[0].trim().toLowerCase()];
  if (!ext) return name;
  const dot = /\.([a-z0-9]{1,5})$/i.exec(name);
  const has = dot?.[1].toLowerCase();
  if (has === ext || (ext === "jpg" && (has === "jpeg" || has === "jfif")) || (ext === "tif" && has === "tiff")) return name;
  // Only a picture extension is replaced; "Bản vẽ 12.10" keeps its ".10".
  const stem = dot && has && IMAGE_EXTS.has(has) ? name.slice(0, -dot[0].length) : name;
  return `${stem}.${ext}`;
}

// Supabase answers `?download=<name>` as a file to keep, not a page to show.
export function downloadLink(url: string, name: string): string {
  if (!url.includes(PUBLIC_OBJECT_MARKER)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
}

function clickLink(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadFile(file: File) {
  const href = URL.createObjectURL(file);
  clickLink(href, file.name);
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export type SaveOutcome =
  | { kind: "downloaded" } // handed to the browser's downloads
  | { kind: "shared" } // the iPhone/iPad share sheet did its job
  | { kind: "cancelled" } // …or was closed without doing anything
  | { kind: "tap-again"; file: File }; // iOS: ready, but the sheet needs a fresh tap

// iOS only opens its share sheet straight after a tap. When fetching the
// picture took too long for that, the caller keeps the file and calls this
// again from the next tap.
export async function shareFile(file: File): Promise<SaveOutcome> {
  try {
    await navigator.share({ files: [file] });
    return { kind: "shared" };
  } catch (e) {
    const reason = (e as Error)?.name;
    if (reason === "AbortError") return { kind: "cancelled" };
    if (reason === "NotAllowedError") return { kind: "tap-again", file };
    downloadFile(file);
    return { kind: "downloaded" };
  }
}

// `stillWanted` is asked once the picture has arrived: a viewer closed in
// the meantime shouldn't have a share sheet pop up over the chat.
export async function savePicture(url: string, filename: string | null | undefined, stillWanted: () => boolean = () => true): Promise<SaveOutcome> {
  let file: File;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    file = new File([blob], saveName(url, filename, blob.type), { type: blob.type });
  } catch {
    // Couldn't read it here: let the browser fetch it as a download instead.
    if (!stillWanted()) return { kind: "cancelled" };
    const name = saveName(url, filename);
    clickLink(downloadLink(url, name), name);
    return { kind: "downloaded" };
  }
  if (!stillWanted()) return { kind: "cancelled" };
  if (isAppleTouch(navigator.userAgent, navigator.maxTouchPoints) && navigator.canShare?.({ files: [file] })) {
    return shareFile(file);
  }
  downloadFile(file);
  return { kind: "downloaded" };
}
