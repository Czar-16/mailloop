"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = ["Compose", "Templates", "History", "Contacts", "Settings"];
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="workspace-nav" aria-label="Main navigation">
      {links.map((name) => {
        const href = `/${name.toLowerCase()}`;
        return (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            {name}
          </Link>
        );
      })}
    </nav>
  );
}
