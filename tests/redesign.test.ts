import { describe, expect, it } from "vitest";
import { estimateSeconds } from "@/components/progress-ring";
import { previewParts } from "@/components/template-preview";
const values = {
  name: "Alex Smith",
  company: null,
  role: "Engineer",
  resume_link: "https://example.test/resume",
};
describe("template preview mirrors send substitutions", () => {
  it("fills full names, whitespace, repeated tokens, and absent optional values", () => {
    const rendered = previewParts(
      "Hi {{ name }}, {{company}}: {{role}} / {{role}}",
      values,
      true,
    );
    expect(rendered.parts.map((part) => part.text).join("")).toBe(
      "Hi Alex Smith, : Engineer / Engineer",
    );
    expect(rendered.errors).toEqual([]);
  });
  it("flags unknown, empty, unclosed and stray brackets", () => {
    for (const text of ["{{nmae}}", "{{}}", "{{name", "}}", "{{{{name}}"]) {
      const rendered = previewParts(text, values, true);
      expect(rendered.errors.length, text).toBeGreaterThan(0);
      expect(
        rendered.parts.some((part) => part.kind === "invalid"),
        text,
      ).toBe(true);
    }
  });
  it("allows the resume link only in the body and keeps markup as plain text", () => {
    expect(previewParts("{{resume_link}}", values, false).errors[0]).toContain(
      "body only",
    );
    expect(previewParts("{{resume_link}}", values, true).parts[0].text).toBe(
      values.resume_link,
    );
    expect(
      previewParts(
        "{{name}}",
        { ...values, name: "<script>alert(1)</script>" },
        true,
      ).parts[0].text,
    ).toBe("<script>alert(1)</script>");
  });
});
describe("estimated queue time", () => {
  it("uses eligible count and midpoint spacing without a hard-coded duration", () => {
    expect(estimateSeconds(0)).toBe(0);
    expect(estimateSeconds(1)).toBe(40);
    expect(estimateSeconds(3)).toBe(120);
    expect(estimateSeconds(15)).toBe(600);
  });
  it("includes the actual next-send wait and clamps past scheduling times", () => {
    const now = Date.parse("2026-10-08T10:00:00Z");
    expect(estimateSeconds(3, "2026-10-08T10:02:00Z", now)).toBe(200);
    expect(estimateSeconds(3, "2026-10-08T09:00:00Z", now)).toBe(80);
    expect(estimateSeconds(0, "2026-10-08T10:02:00Z", now)).toBe(0);
  });
});
