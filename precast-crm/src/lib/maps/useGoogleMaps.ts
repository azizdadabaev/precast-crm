"use client";

import { useEffect, useState } from "react";

// Loose typing is intentional and isolated to this file — we do NOT pull in
// @types/google.maps. Callers treat `maps` as `any`.
declare global {
  interface Window {
    google?: any;
  }
}

export type GoogleMapsStatus = "absent" | "loading" | "ready" | "error";

export interface UseGoogleMaps {
  maps: any | null;
  status: GoogleMapsStatus;
}

const SCRIPT_ID = "google-maps-js";

// Module-level singleton so the script is injected at most once across mounts.
let loaderPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    // Already present (e.g. loaded by an earlier mount or another feature).
    if (typeof window !== "undefined" && window.google?.maps) {
      resolve();
      return;
    }

    const existing =
      typeof document !== "undefined"
        ? (document.getElementById(SCRIPT_ID) as HTMLScriptElement | null)
        : null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("maps script error")));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("maps script error")));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

/**
 * Lazily inject the Google Maps JS API IF a key is configured.
 * No key → { maps: null, status: "absent" } and NO script injected (graceful
 * degrade). The Google surface is typed as `any`, confined to this file.
 */
export function useGoogleMaps(): UseGoogleMaps {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<GoogleMapsStatus>(apiKey ? "loading" : "absent");

  useEffect(() => {
    if (!apiKey) {
      setStatus("absent");
      return;
    }

    // Already available — skip the loader entirely.
    if (typeof window !== "undefined" && window.google?.maps) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    loadGoogleMaps(apiKey).then(
      () => {
        if (!cancelled) setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const maps =
    status === "ready" && typeof window !== "undefined" ? window.google?.maps ?? null : null;

  return { maps, status };
}
