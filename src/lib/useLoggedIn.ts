"use client";

import { useCallback, useEffect, useState } from "react";
import { SESSION_CHANGE_EVENT, session } from "@/lib/api";

export function useLoggedIn() {
  const [loggedIn, setLoggedIn] = useState(false);

  const sync = useCallback(() => {
    setLoggedIn(!!session.getToken());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, [sync]);

  return loggedIn;
}
