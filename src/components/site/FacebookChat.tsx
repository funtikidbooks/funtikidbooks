"use client";

import { useEffect, useRef } from "react";

// facebook.com/FuntiKidbooks — Page ID from Facebook's own Page Transparency panel.
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

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/vi_VN/sdk/xfbml.customerchat.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return (
    <>
      <div id="fb-root" />
      <div ref={chatRef} className="fb-customerchat" />
    </>
  );
}
