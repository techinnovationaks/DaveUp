"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AppShell, AuthShell } from "./Shell";

/** Buttons fill their container on mobile and size to content from 768 up, except inside auth forms. */
const FullWidth = createContext(false);

/** Signed-in screen. See AppShell for `nav`, `aside` and `narrow`. */
export function Screen({ children, nav = false, aside, narrow }: { children: ReactNode; nav?: boolean; aside?: ReactNode; narrow?: boolean }) {
  return (
    <AppShell nav={nav} aside={aside} narrow={narrow}>
      {children}
    </AppShell>
  );
}

/** Sign-in and onboarding screen. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <FullWidth.Provider value={true}>
      <AuthShell>{children}</AuthShell>
    </FullWidth.Provider>
  );
}

function widthClass(full: boolean | undefined, ctx: boolean) {
  return full || ctx ? "w-full" : "w-full md:w-auto md:min-w-[180px]";
}

export function TopBar({ title, back }: { title?: string; back?: string | true }) {
  const router = useRouter();
  return (
    <div className={`mb-6 flex items-center gap-3 ${back ? "" : "md:hidden"}`}>
      {back && (
        <button
          aria-label="Back"
          onClick={() => (back === true ? router.back() : router.push(back))}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-line bg-white text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      {title && <p className={`flex-1 text-center text-[15px] font-semibold text-ink md:hidden ${back ? "pr-11" : ""}`}>{title}</p>}
    </div>
  );
}

export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink md:text-[32px]">{children}</h1>
      {sub && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted md:text-[16px]">{sub}</p>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ variant = "primary", full, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  const ctx = useContext(FullWidth);
  const styles: Record<Variant, string> = {
    primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50",
    secondary: "border border-surface-line bg-white text-ink hover:bg-surface disabled:opacity-50",
    ghost: "text-brand hover:bg-brand-soft disabled:opacity-50",
    danger: "border border-danger-line bg-danger-soft text-danger-dark hover:bg-danger-line/40 disabled:opacity-50",
  };
  return (
    <button className={`min-h-[52px] rounded-2xl px-6 text-[16px] font-bold transition-colors md:min-h-[48px] ${widthClass(full, ctx)} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary", full }: { href: string; children: ReactNode; variant?: Variant; full?: boolean }) {
  const ctx = useContext(FullWidth);
  const styles: Record<Variant, string> = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-surface-line bg-white text-ink hover:bg-surface",
    ghost: "text-brand hover:bg-brand-soft",
    danger: "border border-danger-line bg-danger-soft text-danger-dark",
  };
  return (
    <Link href={href} className={`flex min-h-[52px] items-center justify-center rounded-2xl px-6 text-[16px] font-bold transition-colors md:inline-flex md:min-h-[48px] ${widthClass(full, ctx)} ${styles[variant]}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "", tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "brand" | "soft" | "dashed" }) {
  const tones = {
    plain: "border border-surface-line bg-white",
    brand: "bg-brand text-white",
    soft: "border border-brand-line bg-brand-soft",
    dashed: "border border-dashed border-brand bg-white",
  };
  return <section className={`rounded-card p-5 ${tones[tone]} ${className}`}>{children}</section>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] font-bold uppercase tracking-wider text-brand ${className}`}>{children}</p>;
}

export function Pill({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "red" | "amber" | "green" }) {
  const tones = { grey: "bg-surface-line text-ink-muted", red: "bg-brand-soft text-brand-dark", amber: "bg-warn-soft text-warn", green: "bg-ok-soft text-ok" };
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[14px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-ink-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-surface-line bg-white px-4 py-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand/15";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger-dark">
      {children}
    </p>
  );
}

export function Initials({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-[15px] font-bold text-brand">
      {initials || "?"}
    </span>
  );
}

export function Loading() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" aria-busy>
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-6 flex rounded-2xl bg-surface-line/60 p-1 md:inline-flex md:min-w-[360px]" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-2 text-[15px] font-semibold md:px-4 md:text-[16px] ${value === o.value ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ href, onClick, title, sub, right }: { href?: string; onClick?: () => void; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold text-ink">{title}</p>
        {sub && <p className="mt-0.5 text-[14px] text-ink-muted">{sub}</p>}
      </div>
      {right}
      {(href || onClick) && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
      )}
    </>
  );
  const cls = `flex w-full items-center gap-3 py-3.5 text-left ${href || onClick ? "md:-mx-2 md:w-[calc(100%+1rem)] md:rounded-xl md:px-2 md:hover:bg-surface" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}
