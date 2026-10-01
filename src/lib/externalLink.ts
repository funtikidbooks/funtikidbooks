"use client";

import { useEffect, useState } from "react";

// On an iPhone/iPad, the workspace added to the Home Screen opens an
// outside link (an Upwork job) in a browser sheet inside the app — one that
// shares no sign-in with Safari and never hands off to the Upwork app, so
// the job opened signed out (PM Alice, 1/10). iOS 17+ understands
// "x-safari-https://…", which opens the link in Safari itself, where the
// person is signed in (and from where the Upwork app can take over).
// Everywhere else the link is left exactly as it is.
function needsSafariHandoff() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone) return false;
  const v = ua.match(/OS (\d+)_/) ?? ua.match(/Version\/(\d+)/);
  return !!v && Number(v[1]) >= 17;
}

// Returns a function that turns an https link into the one to put in href.
// Decided after mount (it reads the device), so the first render matches
// the server's.
export function useOutsideLink() {
  const [safari, setSafari] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSafari(needsSafariHandoff());
  }, []);
  return (url: string) => (safari && /^https:\/\//i.test(url) ? url.replace(/^https:\/\//i, "x-safari-https://") : url);
}
