"use client";
import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { Send, Files, Users, Clock, Settings, Menu } from "lucide-react";
const links = [
  { href: "/compose", name: "Compose", icon: Send },
  { href: "/templates", name: "Templates", icon: Files },
  { href: "/contacts", name: "Contacts", icon: Users },
  { href: "/history", name: "History", icon: Clock },
  { href: "/settings", name: "Settings", icon: Settings },
];
export function Navigation() {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const items = links.map(({ href, name, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      onClick={() => menu.current?.removeAttribute("open")}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm transition-colors ${pathname === href ? "bg-muted font-medium text-foreground" : "text-body hover:bg-muted"}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {name}
    </Link>
  ));
  return (
    <nav aria-label="Main navigation">
      <div className="hidden gap-1 sm:flex">{items}</div>
      <details ref={menu} className="sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-3 text-sm font-medium hover:bg-muted">
          <Menu className="size-4" aria-hidden="true" />
          Menu
          <span className="ml-auto text-body">
            {links.find((l) => l.href === pathname)?.name}
          </span>
        </summary>
        <div className="mt-2 grid gap-1 rounded-sm border border-border p-2">
          {items}
        </div>
      </details>
    </nav>
  );
}
