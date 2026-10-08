"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel p-4 sm:p-6">
      <h1 className="text-[26px] leading-[34px] sm:text-[32px] sm:leading-10">
        Could not load your workspace
      </h1>
      <p className="my-4 text-sm text-body">
        Try again. If the problem continues, refresh the page.
      </p>
      <Button onClick={reset}>Try Again</Button>
    </section>
  );
}
