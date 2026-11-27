// "Tải về" in the picture viewer: iPhone/iPad hand the picture to the share
// sheet ("Lưu hình ảnh"), everything else downloads it.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { downloadLink, isAppleTouch, savePicture, saveName, shareFile } from "../src/lib/saveImage.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const PHOTO = "https://x.supabase.co/storage/v1/object/public/chat/abc/0f3a.jpg";

test("iPhones and iPads (even the desktop-looking iPad) are told apart from the rest", () => {
  assert.equal(isAppleTouch(IPHONE, 5), true);
  assert.equal(isAppleTouch(IPAD, 5), true);
  assert.equal(isAppleTouch(IPAD, 0), false, "a real Mac");
  assert.equal(isAppleTouch(ANDROID, 5), false);
  assert.equal(isAppleTouch("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129", 10), false);
});

test("saved name: as sent, with the extension matching what's inside", () => {
  assert.equal(saveName(PHOTO, "Bìa sách.jpg", "image/jpeg"), "Bìa sách.jpg");
  assert.equal(saveName(PHOTO, "IMG_01.JPEG", "image/jpeg"), "IMG_01.JPEG");
  assert.equal(saveName(PHOTO, "bia.jpg", "image/webp"), "bia.webp", "WebP under a .jpg name");
  assert.equal(saveName(PHOTO, "Bản vẽ 12.10", "image/png"), "Bản vẽ 12.10.png");
  assert.equal(saveName(PHOTO, null, "image/jpeg"), "0f3a.jpg", "no name: the one in the link");
  assert.equal(saveName("https://x/a%C3%A1nh.png?t=1", "", "image/png"), "aánh.png");
  assert.equal(saveName(PHOTO, "a/b\\c:d.png", "image/png"), "a_b_c_d.png");
  assert.equal(saveName("https://x/", "", ""), "anh");
  assert.equal(saveName(PHOTO, "tranh.psd", "application/octet-stream"), "tranh.psd", "unknown type: name untouched");
});

test("the download link asks Supabase for a file to keep", () => {
  assert.equal(downloadLink(PHOTO, "Bìa 1.jpg"), `${PHOTO}?download=B%C3%ACa%201.jpg`);
  assert.equal(downloadLink(`${PHOTO}?v=2`, "a.jpg"), `${PHOTO}?v=2&download=a.jpg`);
  assert.equal(downloadLink("blob:https://x/123", "a.jpg"), "blob:https://x/123");
});

// ---- savePicture with the browser stood in for ----

let clicked;
let shared;
let shareError;
let userAgent;
let fetchFails;

beforeEach(() => {
  clicked = [];
  shared = [];
  shareError = null;
  userAgent = IPHONE;
  fetchFails = false;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      get userAgent() {
        return userAgent;
      },
      maxTouchPoints: 5,
      canShare: (d) => !!d?.files?.length,
      share: async (d) => {
        if (shareError) throw Object.assign(new Error(shareError), { name: shareError });
        shared.push(d);
      },
    },
  });
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => {
      const a = { click: () => clicked.push({ href: a.href, download: a.download }), remove() {} };
      return a;
    },
  };
  globalThis.fetch = async () => {
    if (fetchFails) throw new TypeError("offline");
    return new Response(new Blob(["xx"], { type: "image/webp" }), { status: 200, headers: { "content-type": "image/webp" } });
  };
});

test("iPhone: the picture itself goes to the share sheet, nothing is downloaded", async () => {
  const out = await savePicture(PHOTO, "bia.jpg");
  assert.equal(out.kind, "shared");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, "bia.webp");
  assert.equal(shared[0].files[0].type, "image/webp");
  assert.equal(clicked.length, 0);
});

test("iPhone: a slow fetch asks for one more tap, then shares the same file", async () => {
  shareError = "NotAllowedError";
  const out = await savePicture(PHOTO, "bia.webp");
  assert.equal(out.kind, "tap-again");
  assert.equal(out.file.name, "bia.webp");
  shareError = null;
  assert.equal((await shareFile(out.file)).kind, "shared");
  assert.equal(shared[0].files[0], out.file);
});

test("iPhone: closing the share sheet does nothing else", async () => {
  shareError = "AbortError";
  assert.equal((await savePicture(PHOTO, "bia.webp")).kind, "cancelled");
  assert.equal(clicked.length, 0);
});

test("Android and computers: a normal download under the sent name", async () => {
  userAgent = ANDROID;
  const out = await savePicture(PHOTO, "Phác thảo 3.webp");
  assert.equal(out.kind, "downloaded");
  assert.equal(shared.length, 0);
  assert.equal(clicked.length, 1);
  assert.match(clicked[0].href, /^blob:/);
  assert.equal(clicked[0].download, "Phác thảo 3.webp");
});

test("a picture that can't be read here is fetched by the browser as a download", async () => {
  fetchFails = true;
  const out = await savePicture(PHOTO, "bia.jpg");
  assert.equal(out.kind, "downloaded");
  assert.equal(clicked[0].href, `${PHOTO}?download=bia.jpg`);
});

test("viewer closed while fetching: nothing pops up afterwards", async () => {
  assert.equal((await savePicture(PHOTO, "bia.jpg", () => false)).kind, "cancelled");
  fetchFails = true;
  assert.equal((await savePicture(PHOTO, "bia.jpg", () => false)).kind, "cancelled");
  assert.equal(shared.length + clicked.length, 0);
});
