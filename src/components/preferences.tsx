"use client";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { savePreferences } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feedback, useUnsavedChanges } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";
export const commonRoles = [
  "SDE Intern",
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Software Engineer",
];
export function RoleChoices({
  roles,
  onChoose,
  disabled = false,
}: {
  roles: string[];
  onChoose: (role: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => (
        <Button
          key={role}
          type="button"
          variant="outline"
          className="h-auto max-w-full whitespace-normal break-words py-2"
          disabled={disabled}
          onClick={() => onChoose(role)}
        >
          {role}
        </Button>
      ))}
    </div>
  );
}
export function Preferences({
  roles,
  resumeUrl,
  setup = false,
}: {
  roles: string[];
  resumeUrl: string | null;
  setup?: boolean;
}) {
  const [values, setValues] = useState(roles);
  const [custom, setCustom] = useState("");
  const [url, setUrl] = useState(resumeUrl ?? "");
  const [result, setResult] = useState<ActionResult>();
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  useUnsavedChanges(dirty);
  function add(role: string) {
    setDirty(true);
    if (
      !role.trim() ||
      values.length >= 5 ||
      values.some((v) => v.toLowerCase() === role.trim().toLowerCase())
    ) {
      setResult({ ok: false, message: "Choose 1–5 unique, nonempty roles." });
      return;
    }
    setValues([...values, role.trim()]);
    setCustom("");
    setResult(undefined);
  }
  return (
    <section className="panel mb-6 space-y-4 p-6">
      <h2 className="text-xl font-semibold">
        {setup ? "Choose Your Preferred Roles" : "Outreach Preferences"}
      </h2>
      <p className="text-sm text-body">
        Save 1–5 role shortcuts. You can still use custom roles for any
        recipient.
      </p>
      <RoleChoices roles={commonRoles} onChoose={add} disabled={pending} />
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <Button
            key={v}
            variant="outline"
            className="h-auto max-w-full whitespace-normal break-words py-2"
            disabled={pending}
            onClick={() => {
              setValues(values.filter((r) => r !== v));
              setDirty(true);
            }}
            aria-label={`Remove ${v}`}
          >
            {v} ×
          </Button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await savePreferences({
              preferredRoles: values,
              resumeUrl: url,
            });
            setResult(r);
            if (r.ok) {
              setDirty(false);
              router.refresh();
            }
          });
        }}
      >
        <label className="block text-sm">
          Custom role
          <Input
            name="customRole"
            value={custom}
            maxLength={160}
            autoComplete="off"
            disabled={pending}
            onChange={(e) => setCustom(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => add(custom)}
        >
          Add Role
        </Button>
        {!setup && (
          <label className="block text-sm">
            Resume URL (optional HTTPS link)
            <Input
              name="resumeUrl"
              type="url"
              value={url}
              maxLength={2048}
              autoComplete="off"
              disabled={pending}
              onChange={(e) => {
                setUrl(e.target.value);
                setDirty(true);
              }}
              placeholder="https://example.com/resume…"
            />
          </label>
        )}
        <Feedback result={result} />
        <Button disabled={pending}>
          {pending ? "Saving…" : "Save Preferences"}
        </Button>
      </form>
    </section>
  );
}

export function RoleSetup({ resumeUrl }: { resumeUrl: string | null }) {
  const pathname = usePathname();
  return pathname === "/settings" ? null : (
    <Preferences roles={[]} resumeUrl={resumeUrl} setup />
  );
}
