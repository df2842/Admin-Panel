"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/media", label: "Media", icon: "🖼️" },
  { href: "/users", label: "Users", icon: "👥" },
  { href: "/votes", label: "Votes", icon: "🗳️" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Admin navigation: vertical in the sidebar, horizontal on small screens. */
export default function AdminNav({ variant }: { variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  return (
    <ul className={variant === "sidebar" ? "space-y-1" : "flex gap-1 overflow-x-auto"}>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-primary text-primary-foreground shadow" : "text-sidebar-foreground/80 hover:bg-white/10"
              }`}
            >
              <span aria-hidden className="text-base">
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
