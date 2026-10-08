"use client";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = ["Compose", "Templates", "History", "Contacts", "Settings"];
export function Navigation() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const container = nav.current;
    const pill = highlight.current;
    if (!container || !pill) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const active = container.querySelector<HTMLAnchorElement>(
        'a[aria-current="page"]',
      );
      if (!active) {
        pill.style.opacity = "0";
        return;
      }
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      pill.style.opacity = "1";
      const left = active.offsetLeft - 5;
      const right = active.offsetLeft + active.offsetWidth + 5;
      if (left < container.scrollLeft) container.scrollLeft = left;
      else if (right > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = right - container.clientWidth;
      }
    };
    if (!initialized.current) pill.style.transition = "none";
    measure();
    const frame = requestAnimationFrame(() => {
      pill.style.transition = "";
      initialized.current = true;
    });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll("a").forEach((link) => observer.observe(link));
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <nav ref={nav} className="workspace-nav" aria-label="Main navigation">
      <span
        ref={highlight}
        className="workspace-nav-highlight"
        aria-hidden="true"
      />
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
