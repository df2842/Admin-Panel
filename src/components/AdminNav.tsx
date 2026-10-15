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
    <ul className={variant === "sidebar" ? "space-y-1" : "grid grid-cols-4 gap-1"}>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center whitespace-nowrap rounded-xl font-semibold transition ${
                variant === "bar"
                  ? "flex-col justify-center gap-0.5 px-1 py-1.5 text-[11px]"
                  : "gap-3 px-3 py-2.5 text-sm"
              } ${
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
