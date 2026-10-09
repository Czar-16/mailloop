"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SearchButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="outline"
      type="submit"
      className="min-w-36"
      disabled={pending}
      aria-busy={pending}
    >
      {pending && (
        <LoaderCircle className="button-spinner" aria-hidden="true" />
      )}
      <span aria-live="polite">{pending ? "Searching…" : "Search"}</span>
    </Button>
  );
}
