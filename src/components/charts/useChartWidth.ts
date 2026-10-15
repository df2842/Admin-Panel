"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures the width of a chart's container so the SVG can be drawn at real
 * pixel size (crisp 1px gridlines, readable text on phones). Until the first
 * measurement the SVG scales from `fallback` via its viewBox.
 */
export function useChartWidth<T extends HTMLElement = HTMLDivElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      // Hidden containers (table view) report 0: keep the last real width.
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
