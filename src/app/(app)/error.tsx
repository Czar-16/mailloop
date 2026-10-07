"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel p-8">
      <h1 className="text-2xl font-semibold">Could not load your workspace</h1>
      <p className="my-4 text-sm text-body">
        Check the database connection, then try again.
      </p>
      <Button onClick={reset}>Try Again</Button>
    </section>
  );
}
