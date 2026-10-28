"use client";

// The chat "ding", played through Web Audio instead of an <audio> element.
//
// An <audio> element takes the phone's audio focus: on iPhone and Android,
// every play() — including the silent "unlock" play we used to do on the
// first tap so later dings were allowed — paused whatever else was playing.
// Staff listening to Spotify had it stop the moment they touched the
// workspace. Web Audio doesn't request audio focus on Android, and on
// iOS/Safari the "ambient" audio session (Audio Session API, Safari 17+)
// mixes with other apps' audio instead of interrupting it — the same way a
// game's sound effects play over your music.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

const SOUND_URL = "/sounds/dm-message.mp3";
// One ding per burst — five messages landing in the same second (a pasted
// list, several photos, two rooms at once) shouldn't machine-gun it.
const THROTTLE_MS = 1500;

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
let lastDingAt = 0;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const nav = navigator as AudioSessionNavigator;
  try {
    if (nav.audioSession) nav.audioSession.type = "ambient";
  } catch {
    // Older Safari/other browsers — Web Audio alone still doesn't pause Android music.
  }
  const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function load(c: AudioContext): Promise<void> {
  if (buffer) return Promise.resolve();
  if (!loading) {
    loading = fetch(SOUND_URL)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .then((decoded) => {
        buffer = decoded;
      })
      .catch(() => {
        loading = null;
      });
  }
  return loading;
}

// Browsers only let audio start after a real tap/keypress. Resuming the
// (silent) audio context on the first one is enough — nothing is played,
// so nothing gets interrupted.
export function unlockChatSound() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  load(c);
}

export function playChatDing() {
  const now = Date.now();
  if (now - lastDingAt < THROTTLE_MS) return;
  lastDingAt = now;

  const c = context();
  if (!c) return;
  const start = () => {
    if (!buffer) return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start();
  };
  const ready = c.state === "suspended" ? c.resume().catch(() => {}) : Promise.resolve();
  Promise.all([ready, load(c)]).then(start, () => {});
}

// The customer chime (Khách hàng): three rising notes, twice — nothing like
// the chat ding, so a customer message can be told apart without looking.
// Synthesised, so there's no file to load; same unlocked audio context.
let lastChimeAt = 0;
export function playCustomerChime() {
  const now = Date.now();
  if (now - lastChimeAt < 4000) return;
  lastChimeAt = now;
  const c = context();
  if (!c) return;
  const ready = c.state === "suspended" ? c.resume().catch(() => {}) : Promise.resolve();
  ready.then(() => {
    const t0 = c.currentTime + 0.02;
    const notes = [880, 1175, 1568, 880, 1175, 1568];
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.16 + (i >= 3 ? 0.25 : 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  }, () => {});
}
