"use client";
// The organization's invite: its code, a link and a QR code that open the
// Join page with the code filled in. Joining still needs an administrator's
// approval; none of these grant a role.
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Card, Eyebrow } from "@/components/ui";

/** Dark modules of a QR code for the text, as a grid. */
function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

function QrSvg({ grid, size }: { grid: boolean[][]; size: number }) {
  const n = grid.length;
  const quiet = 4;
  const total = n + quiet * 2;
  let d = "";
  grid.forEach((row, r) => row.forEach((dark, c) => dark && (d += `M${c + quiet} ${r + quiet}h1v1h-1z`)));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" role="img" aria-label="QR code to join">
      <rect width={total} height={total} fill="#fff" />
      <path d={d} fill="#0F1F4D" />
    </svg>
  );
}

/** A printable PNG: the QR code with the organization's name and code under it. */
function downloadPng(grid: boolean[][], name: string, code: string) {
  const n = grid.length;
  const cell = 16;
  const quiet = 4 * cell;
  const qrSize = n * cell + quiet * 2;
  const canvas = document.createElement("canvas");
  canvas.width = qrSize;
  canvas.height = qrSize + 150;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0F1F4D";
  grid.forEach((row, r) => row.forEach((dark, c) => dark && ctx.fillRect(quiet + c * cell, quiet + r * cell, cell, cell)));
  ctx.textAlign = "center";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(name.length > 34 ? `${name.slice(0, 33)}…` : name, canvas.width / 2, qrSize + 40);
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(`Scan to join on DaveUp · code ${code}`, canvas.width / 2, qrSize + 95);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name.replace(/[^\w -]+/g, "").trim() || "DaveUp"} QR code.png`;
  a.click();
}

export function InviteCard({ code, name }: { code: string; name: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin ? `${origin}/join?code=${encodeURIComponent(code)}` : "";
  const grid = useMemo(() => (link ? qrModules(link) : null), [link]);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  };

  return (
    <Card>
      <Eyebrow className="mb-3">Invite people</Eyebrow>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0 self-center rounded-2xl border border-surface-line bg-card p-2 sm:self-start">{grid ? <QrSvg grid={grid} size={148} /> : <div className="h-[148px] w-[148px]" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-muted">Organization code</p>
          <button onClick={() => void copy("code")} title="Copy code" className="font-mono text-[28px] font-extrabold tracking-[0.2em] text-ink hover:text-brand">
            {code}
          </button>
          {copied === "code" && <span className="ml-2 text-[13px] font-semibold text-ok">Copied</span>}
          <p className="mt-2 break-all rounded-xl bg-surface px-3 py-2 font-mono text-[13px] text-ink">{link || " "}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => void copy("link")} className="rounded-xl bg-brand px-4 py-2 text-[14px] font-bold text-on-brand hover:bg-brand-dark">
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            {canShare && (
              <button
                onClick={() => void navigator.share({ title: `Join ${name} on DaveUp`, text: `Join ${name} on DaveUp`, url: link }).catch(() => {})}
                className="rounded-xl border border-surface-line px-4 py-2 text-[14px] font-semibold text-ink hover:border-brand-line"
              >
                Share
              </button>
            )}
            {grid && (
              <button onClick={() => downloadPng(grid, name, code)} className="rounded-xl border border-surface-line px-4 py-2 text-[14px] font-semibold text-ink hover:border-brand-line">
                Download QR code
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-ink-muted">Print the QR code or share the link in announcements. People who scan it sign in, find {name} ready to join, and wait for your approval. It never grants a role.</p>
    </Card>
  );
}
