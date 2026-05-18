"use client";

import { useEffect } from "react";
import { unlockAudio } from "@/lib/notification-sound";

/**
 * Listens for the first user gesture (click/keydown) and unlocks the
 * AudioContext so playNotificationSound() can fire. Renders nothing.
 */
export function AudioUnlocker() {
  useEffect(() => {
    const handler = () => {
      unlockAudio();
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
    };
    document.addEventListener("click", handler, { once: true });
    document.addEventListener("keydown", handler, { once: true });
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
    };
  }, []);
  return null;
}
