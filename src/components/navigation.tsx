"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Send,
  Files,
  Users,
  Mail,
  Clock,
  ChartNoAxesColumn,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
const links = [
  { href: "/compose", name: "Compose", icon: Send },
  { href: "/templates", name: "Templates", icon: Files },
  { href: "/contacts", name: "Contacts", icon: Users },
  { href: null, name: "Campaigns", icon: Mail },
  { href: "/history", name: "History", icon: Clock },
  { href: null, name: "Analytics", icon: ChartNoAxesColumn },
  { href: "/settings", name: "Settings", icon: Settings },
];
export function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1">
        {links.map(({ href, name, icon: Icon }) => (
          <li key={name} aria-disabled={href ? undefined : true}>
            {href ? (
              <Link
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-sm px-3 py-3 text-sm no-underline transition-colors",
                  pathname === href
                    ? "bg-accent-soft font-semibold text-link"
                    : "font-medium text-body hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {name}
              </Link>
            ) : (
              <div className="flex min-h-11 items-start gap-3 px-3 py-3 text-muted-foreground">
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 text-sm">
                  {name}
                  <span className="mt-0.5 block text-xs">
                    Not available yet
                  </span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
