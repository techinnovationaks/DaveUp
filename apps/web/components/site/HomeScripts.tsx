"use client";
// Behaviour for the DaveUp.html homepage: the monthly/yearly price switch, the
// rotating quotes, "Open DaveUp" for people already signed in, and the
// light/dark choice made in the app (otherwise the device setting decides).
import { useEffect } from "react";
import { nextStep, useSession } from "@/lib/session";

export function HomeScripts() {
  const { me, loading } = useSession();

  // Light or dark: the app's choice, if the person made one.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".dvh");
    if (!root) return;
    try {
      const t = localStorage.getItem("daveup.theme");
      if (t === "light" || t === "dark") root.dataset.theme = t;
    } catch {}
  }, []);

  // Monthly or yearly prices.
  useEffect(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>(".dvh .tg"));
    const set = (mode: string) => {
      document.querySelectorAll<HTMLElement>(".dvh [data-m]").forEach((el) => {
        el.textContent = el.getAttribute(mode === "y" ? "data-y" : "data-m");
      });
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode)));
    };
    const handlers = btns.map((b) => {
      const h = () => set(b.getAttribute("data-mode") ?? "m");
      b.addEventListener("click", h);
      return () => b.removeEventListener("click", h);
    });
    return () => handlers.forEach((off) => off());
  }, []);

  // Quotes that turn by themselves, with previous, pause and next.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".dvh");
    const box = document.querySelector<HTMLElement>(".dvh .qwrap");
    const pb = document.getElementById("qpause");
    const prev = document.getElementById("qprev");
    const next = document.getElementById("qnext");
    if (!root || !box || !pb || !prev || !next) return;
    const slides = Array.from(box.querySelectorAll<HTMLElement>(".qs"));
    const dots = Array.from(box.querySelectorAll<HTMLElement>(".qd"));
    let i = 0;
    let t: ReturnType<typeof setInterval> | null = null;
    let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.add("js-q");
    const show = (n: number) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((e, k) => e.classList.toggle("on", k === i));
      dots.forEach((e, k) => e.setAttribute("aria-current", String(k === i)));
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = null;
    };
    const go = () => {
      stop();
      if (!paused) t = setInterval(() => show(i + 1), 7000);
    };
    const setP = (v: boolean) => {
      paused = v;
      pb.textContent = v ? "Play" : "Pause";
      pb.setAttribute("aria-label", v ? "Resume rotation" : "Pause rotation");
      go();
    };
    const onPrev = () => (show(i - 1), go());
    const onNext = () => (show(i + 1), go());
    const onPause = () => setP(!paused);
    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    pb.addEventListener("click", onPause);
    const dotHandlers = dots.map((d, k) => {
      const h = () => (show(k), go());
      d.addEventListener("click", h);
      return () => d.removeEventListener("click", h);
    });
    box.addEventListener("mouseenter", stop);
    box.addEventListener("mouseleave", go);
    box.addEventListener("focusin", stop);
    box.addEventListener("focusout", go);
    setP(paused);
    show(0);
    return () => {
      stop();
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      pb.removeEventListener("click", onPause);
      dotHandlers.forEach((off) => off());
      box.removeEventListener("mouseenter", stop);
      box.removeEventListener("mouseleave", go);
      box.removeEventListener("focusin", stop);
      box.removeEventListener("focusout", go);
    };
  }, []);

  // Signed in already: the header's buttons open the app instead.
  useEffect(() => {
    if (loading || !me) return;
    const nav = document.querySelector<HTMLElement>(".dvh header.nav");
    if (!nav) return;
    const signIn = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href="/signin"]'));
    const start = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href="/signup"]'));
    signIn.forEach((a) => (a.style.display = "none"));
    start.forEach((a) => {
      a.href = nextStep(me);
      a.textContent = "Open DaveUp";
    });
  }, [me, loading]);

  return null;
}
