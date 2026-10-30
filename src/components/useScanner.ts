"use client";

import { useEffect, useRef } from "react";

// Bluetooth and USB barcode scanners act like a keyboard: they type the code very fast and press Enter.
// This listens for that pattern anywhere on the page, so the cashier does not need to click a box first.
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last > 60) buf = ""; // a person typing is slower than this between keys
      last = now;
      if (e.key === "Enter") {
        if (buf.length >= 4) {
          const t = e.target as HTMLElement | null;
          // Typed into a form field other than the search box: leave it to that field.
          if (t?.closest("form") || (t instanceof HTMLInputElement && t.id !== "f-q")) { buf = ""; return; }
          e.preventDefault();
          e.stopPropagation(); // the search box must not also handle this Enter
          cb.current(buf);
        }
        buf = "";
      } else if (e.key.length === 1) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
