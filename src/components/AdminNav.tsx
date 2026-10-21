"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type NavItem = { href: string; label: string; icon: string; hint?: string };
type NavGroup = { label: string; items: NavItem[] };

/** Every admin section, grouped the way the sidebar and the phone menu show them. */
export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ href: "/", label: "Dashboard", icon: "📊" }] },
  {
    label: "Content",
    items: [
      { href: "/media", label: "Media", icon: "🖼️", hint: "Photos & jokes" },
      { href: "/terms", label: "Terms", icon: "📖", hint: "Comedy techniques the AI may use" },
      { href: "/examples", label: "AI examples", icon: "🧪", hint: "Example captions shown to the AI" },
    ],
  },
  {
    label: "AI pipeline",
    items: [
      { href: "/prompt-chains", label: "Prompt chains", icon: "⛓️", hint: "Steps and humor mix" },
      { href: "/requests", label: "Generation requests", icon: "📨", hint: "Every generation run" },
      { href: "/llm-responses", label: "LLM responses", icon: "💬", hint: "Every model call" },
      { href: "/llm", label: "Models & providers", icon: "🤖" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/users", label: "Users", icon: "👥" },
      { href: "/votes", label: "Votes", icon: "🗳️" },
      { href: "/access", label: "Sign-in access", icon: "🔐", hint: "Allowed domains and e-mails" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function currentItem(pathname: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const hit = group.items.find((item) => isActive(pathname, item.href));
    if (hit) return hit;
  }
  return undefined;
}

/** The grouped link list, shared by the sidebar and the phone menu. */
function NavGroups({
  pathname,
  onNavigate,
  touch = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  /** Taller rows for fingers (phone menu); the sidebar stays compact. */
  touch?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      {NAV_GROUPS.map((group, g) => (
        <div key={group.label}>
          <p
            id={`${id}-g${g}`}
            className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55"
          >
            {group.label}
          </p>
          <ul aria-labelledby={`${id}-g${g}`} className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.hint}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${touch ? "py-2.5" : "py-1.5"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      active ? "bg-primary text-primary-foreground shadow" : "text-sidebar-foreground/80 hover:bg-white/10"
                    }`}
                  >
                    <span aria-hidden className="w-5 text-center text-base leading-5">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Link to the public app, shown under the sections. */
function AppLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden className="w-5 text-center">
        🎭
      </span>
      Open the app ↗<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Desktop sidebar navigation. The layout lets it scroll when the screen is short. */
export default function AdminNav({ appUrl }: { appUrl: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-3">
      <NavGroups pathname={pathname} />
      <div className="border-t border-white/10 pt-3">
        <AppLink href={appUrl} />
      </div>
    </nav>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phone/tablet top bar: title, the current section and a "Menu" button that
 * opens the same grouped list (WAI-ARIA disclosure pattern). The menu closes
 * when a link is clicked, on Escape or a backdrop tap (focus goes back to the
 * button), and whenever the route changes (back/forward too). While it is
 * open, Tab stays inside the menu and the page behind doesn't scroll.
 */
export function MobileNav({ appUrl, account }: { appUrl: string; account: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close on any route change: adjust state while rendering, no effect needed.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(false);
  }
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const current = currentItem(pathname);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // While open: lock page scroll, close on Escape wherever focus is, and keep
  // Tab / Shift+Tab cycling through the header (Menu button + panel).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const prevGutter = root.style.getPropertyValue("scrollbar-gutter");
    // Keep the scrollbar's space (if there is one) so the page doesn't shift.
    if (window.innerWidth > root.clientWidth) root.style.setProperty("scrollbar-gutter", "stable");
    root.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      const header = headerRef.current;
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === "Tab" && header) {
        const items = Array.from(header.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = active !== null && header.contains(active);
        if (!inside || active === (e.shiftKey ? first : last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    // From lg up the bar is hidden (e.g. a tablet turned to landscape): close
    // so the page isn't left locked.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
      root.style.overflow = prevOverflow;
      root.style.setProperty("scrollbar-gutter", prevGutter);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground lg:hidden">
      <div className="flex h-14 items-center gap-3 px-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 font-bold">
          <span aria-hidden>🛡️</span>
          <span className="shrink-0">Admin</span>
          {current && (
            <span className="truncate font-semibold text-sidebar-foreground/70">
              <span aria-hidden>· </span>
              <span className="sr-only">, </span>
              {current.label}
            </span>
          )}
        </p>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="btn h-10 shrink-0 bg-white/15 text-sidebar-foreground hover:bg-white/25"
        >
          <span aria-hidden>{open ? "✕" : "☰"}</span>
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* Tap outside to close. Hidden from assistive tech: Escape and the button do the same.
          touch-none stops a drag here from scrolling the page underneath (older iOS). */}
      {open && (
        <div aria-hidden className="fixed inset-x-0 bottom-0 top-14 touch-none bg-black/40" onClick={() => close(true)} />
      )}
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-t border-white/10 bg-sidebar px-3 pb-4 pt-3 shadow-xl"
      >
        <nav aria-label="Admin" className="space-y-3">
          <NavGroups pathname={pathname} onNavigate={() => close(false)} touch />
          <div className="border-t border-white/10 pt-3">
            <AppLink href={appUrl} />
          </div>
        </nav>
        <div className="mt-3 border-t border-white/10 px-1 pt-3">{account}</div>
      </div>
    </header>
  );
}
