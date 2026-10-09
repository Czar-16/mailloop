"use client";

import { useEffect, useRef } from "react";

const features = [
  ["Reusable templates", "Keep a version for startups, another for big tech."],
  [
    "Contact manager",
    "Save recruiters and founders, so you never email the same person twice by accident.",
  ],
  ["Resume attached", "Upload your PDF once. It goes with every email."],
  [
    "Delivery and reply tracking",
    "See what landed and who answered, without opening Gmail.",
  ],
  [
    "Your own Gmail",
    "Emails come from your address and live in your Sent folder.",
  ],
  [
    "One email per recipient",
    "No CC lists, no shared threads. Each intro reads personal.",
  ],
];

export function FeatureCards() {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = section.current;
    if (!element || !window.IntersectionObserver) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    element.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
          element.dataset.reveal = "visible";
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    const onMotionChange = () => {
      if (motion.matches) {
        delete element.dataset.reveal;
        observer.disconnect();
      }
    };
    motion.addEventListener("change", onMotionChange);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", onMotionChange);
      delete element.dataset.reveal;
    };
  }, []);
  return (
    <section
      ref={section}
      id="features"
      className="landing-section landing-features"
      aria-labelledby="features-title"
    >
      <p className="landing-eyebrow">Everything in one place</p>
      <h2 id="features-title">Built for the outreach grind.</h2>
      <div className="landing-card-grid">
        {features.map(([title, copy], index) => (
          <article
            key={title}
            className="landing-glow-card"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <h3>{title}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
