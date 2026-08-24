"use client";

import { useEffect, useRef } from "react";

// facebook.com/FuntiKidbooks — real numeric Page ID, taken straight from
// the Page's own Meta Business Suite inbox settings (Hộp thư > Cài đặt
// hộp thư > Nhắn tin > URL Messenger, m.me/<page_id>). The previous ID
// here was guessed from meta tags and didn't match, which silently
// prevented the Customer Chat plugin from ever rendering.
const FB_PAGE_ID = "249373520318216";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: { init: (opts: Record<string, unknown>) => void };
  }
}

// Renders Facebook's Customer Chat Plugin — visitors typing here land as
// real conversations in the Funti Kidbooks Page's Messenger inbox. Requires
// the live domain to be whitelisted under the Page's Messaging settings,
// which only the Page admin can do — see the chat with the user for steps.
export function FacebookChat() {
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.setAttribute("page_id", FB_PAGE_ID);
    chatRef.current?.setAttribute("attribution", "biz_inbox");

    if (document.getElementById("facebook-jssdk")) {
      window.FB?.init({ xfbml: true, version: "v19.0" });
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({ xfbml: true, version: "v19.0" });
    };

    function loadSdk(locale: string, onFail?: () => void) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = `https://connect.facebook.net/${locale}/sdk/xfbml.customerchat.js`;
      script.async = true;
      script.defer = true;
      if (onFail) script.onerror = onFail;
      document.body.appendChild(script);
    }

    // Facebook's vi_VN locale bundle for this SDK has been known to 500 —
    // fall back to en_US (still renders the chat UI in Vietnamese, since
    // that's driven by the visitor's own Facebook/browser locale, not this
    // file) so the widget doesn't just silently disappear when that happens.
    loadSdk("vi_VN", () => {
      document.getElementById("facebook-jssdk")?.remove();
      loadSdk("en_US");
    });
  }, []);

  return (
    <>
      <div id="fb-root" />
      <div ref={chatRef} className="fb-customerchat" />
    </>
  );
}
