"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
type Theme = "light" | "dark";
let localChoice: Theme | null = null;
let themeRequest = 0;
let activeTransition: ViewTransition | undefined;
function snapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function preference(): Theme | null {
  try {
    const value = localStorage.getItem("mailloop-theme");
    return value === "light" || value === "dark" ? value : localChoice;
  } catch {
    return localChoice;
  }
}
function updateThemeColor() {
  const landing = document.querySelector(".landing");
  const color = getComputedStyle(landing ?? document.documentElement)
    .getPropertyValue(landing ? "--landing-bg" : "--background")
    .trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  updateThemeColor();
  window.dispatchEvent(new Event("mailloop-theme"));
}
function defaultTheme(): Theme {
  return window.location.pathname === "/" ||
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function subscribe(callback: () => void) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const system = () => {
    if (!preference()) apply(defaultTheme());
  };
  const storage = () => {
    localChoice = null;
    apply(preference() ?? defaultTheme());
  };
  window.addEventListener("mailloop-theme", callback);
  window.addEventListener("storage", storage);
  query.addEventListener("change", system);
  return () => {
    window.removeEventListener("mailloop-theme", callback);
    window.removeEventListener("storage", storage);
    query.removeEventListener("change", system);
  };
}
function switchTheme(theme: Theme, button: HTMLButtonElement) {
  localChoice = theme;
  try {
    localStorage.setItem("mailloop-theme", theme);
  } catch {
    /* Remains active in this document. */
  }
  const request = ++themeRequest;
  const root = document.documentElement;
  activeTransition?.skipTransition();
  activeTransition = undefined;
  root.removeAttribute("data-theme-reveal");
  root.style.removeProperty("--theme-reveal-origin");
  if (snapshot() === theme) return;
  if (
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply(theme);
    return;
  }
  const bounds = button.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2,
    y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  // Hide the new snapshot from its first frame, before ready starts the reveal.
  root.style.setProperty("--theme-reveal-origin", `${x}px ${y}px`);
  root.setAttribute("data-theme-reveal", "");
  const transition = document.startViewTransition(() => {
    if (request === themeRequest) apply(theme);
  });
  activeTransition = transition;
  let animation: Animation | undefined;
  const cleanup = () => {
    animation?.cancel();
    if (activeTransition !== transition) return;
    activeTransition = undefined;
    root.removeAttribute("data-theme-reveal");
    root.style.removeProperty("--theme-reveal-origin");
  };
  void transition.finished.then(cleanup, cleanup);
  void transition.ready
    .then(() => {
      if (activeTransition !== transition) return;
      animation = root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 750,
          easing: "cubic-bezier(.65,0,.35,1)",
          fill: "both",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      // A failed reveal should still leave the selected theme visible.
      transition.skipTransition();
    });
}
export function ThemeControl() {
  const pathname = usePathname();
  useEffect(() => {
    apply(preference() ?? defaultTheme());
  }, [pathname]);
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  // React may reinsert managed metadata during a theme render. Update it afterwards.
  useEffect(updateThemeColor, [theme, pathname]);
  return (
    <div className="inline-flex items-center gap-3">
      <span className="text-xs text-body">Theme</span>
      <div className="theme-track" role="group" aria-label="Theme">
        <span className="theme-thumb" aria-hidden="true" />
        {(["light", "dark"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-label={`${value === "light" ? "Light" : "Dark"} theme`}
            aria-pressed={theme === value}
            onClick={(event) => switchTheme(value, event.currentTarget)}
          >
            {value === "light" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
