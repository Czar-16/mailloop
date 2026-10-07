"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, Files, Users, Clock, Settings } from "lucide-react";
const links = [{ href: "/compose", name: "Compose", icon: Send }, { href: "/templates", name: "Templates", icon: Files }, { href: "/contacts", name: "Contacts", icon: Users }, { href: "/history", name: "History", icon: Clock }, { href: "/settings", name: "Settings", icon: Settings }];
export function Navigation() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto pb-1">{links.map(({ href, name, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-sm transition-colors ${pathname === href ? "bg-muted font-medium text-foreground" : "text-body hover:bg-muted"}`}><Icon className="size-4" aria-hidden="true" />{name}</Link>)}</nav>;
}
