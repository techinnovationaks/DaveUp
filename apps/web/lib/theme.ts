"use client";
// Light or dark mode for the app. The choice is kept on this device. "system"
// follows the phone or computer setting. The public website always keeps its
// own look. The same rule runs as an inline script in app/layout.tsx before
// the first paint.
import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "dark" | "light" | "system";
const KEY = "daveup.theme";

function systemIsLight() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
}

function apply(choice: ThemeChoice) {
  const light = choice === "light" || (choice === "system" && systemIsLight());
  document.documentElement.classList.toggle("theme-light", light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F7F8FA" : "#051641");
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  const [light, setLight] = useState(false);

  useEffect(() => {
    let saved: ThemeChoice = "dark";
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark" || v === "system") saved = v;
    } catch {}
    setChoice(saved);
    setLight(document.documentElement.classList.contains("theme-light"));
  }, []);

  // Follow the device while "system" is chosen.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => {
      apply("system");
      setLight(mq.matches);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const set = useCallback((c: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    apply(c);
    setChoice(c);
    setLight(c === "light" || (c === "system" && systemIsLight()));
  }, []);

  return { choice, light, set, toggle: () => set(light ? "dark" : "light") };
}
