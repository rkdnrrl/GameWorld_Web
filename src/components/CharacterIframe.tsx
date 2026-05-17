"use client";

import { useEffect } from "react";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

export default function CharacterIframe() {
  useEffect(() => {
    function mount() {
      const user = session.getUser();
      if (!user?.id) return;
      if (document.getElementById("_assistantIframe")) return;
      const iframe = document.createElement("iframe");
      iframe.id = "_assistantIframe";
      iframe.src = `https://assistant-chi-two.vercel.app?userId=${user.id}&app=platform`;
      iframe.style.cssText =
        "position:fixed;bottom:0;right:0;width:220px;height:300px;border:none;background:transparent;z-index:9999;pointer-events:none;";
      document.body.appendChild(iframe);
    }

    function unmount() {
      document.getElementById("_assistantIframe")?.remove();
    }

    mount();

    const onChange = () => {
      if (session.getUser()) {
        mount();
      } else {
        unmount();
      }
    };

    window.addEventListener(SESSION_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onChange);
  }, []);

  return null;
}
