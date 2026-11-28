"use client";
// Light and dark mode controls: a quick sun/moon button, and the full choice
// (Light, Dark, Same as device) for Account settings.
import { useTheme, type ThemeChoice } from "@/lib/theme";

const Sun = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** One tap between light and dark. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { light, toggle } = useTheme();
  const label = light ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-surface-line bg-card text-ink transition-colors hover:border-brand-line ${className}`}
    >
      {light ? Moon : Sun}
    </button>
  );
}

/** Light, dark, or follow the device. */
export function ThemeSetting() {
  const { choice, set } = useTheme();
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "Same as device" },
  ];
  return (
    <div>
      <p className="text-[16px] font-semibold text-ink">Appearance</p>
      <p className="mb-3 text-[14px] text-ink-muted">Kept on this device.</p>
      <div className="flex rounded-[8px] bg-surface p-1" role="radiogroup" aria-label="Appearance">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={choice === o.value}
            onClick={() => set(o.value)}
            className={`flex-1 rounded-[8px] px-2 py-2.5 text-[15px] font-semibold transition-colors ${choice === o.value ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
