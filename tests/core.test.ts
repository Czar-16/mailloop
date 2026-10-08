import { remainingRange } from "@/lib/progress";
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "@/lib/crypto";
import {
  renderTemplate,
  templateSchema,
  campaignSchema,
  validatePdf,
  MAX_PDF_BYTES,
  preferredRolesSchema,
  linkUrlSchema,
} from "@/lib/validation";
import { parseContacts, suggestName, validateImportRows } from "@/lib/imports";

describe("refresh token encryption", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  it("round-trips with a fresh nonce and rejects tampering", () => {
    const encrypted = encryptToken("secret-refresh-token");
    expect(decryptToken(encrypted)).toBe("secret-refresh-token");
    expect(encryptToken("secret-refresh-token")).not.toBe(encrypted);
    const parts = encrypted.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."))).toThrow();
  });
});
describe("template and contact validation", () => {
  it("renders literal replacement values safely", () => {
    expect(
      renderTemplate("Hi {{ name }}, {{company}} / {{role}}", {
        name: "$&",
        company: null,
        role: "Engineer",
      }),
    ).toBe("Hi $&,  / Engineer");
  });
  it("rejects unknown placeholders and injected headers", () => {
    expect(
      templateSchema.safeParse({
        name: "Test",
        subject: "Hi\r\nBcc: bad@example.com",
        body: "Hello",
      }).success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({
        name: "Test",
        subject: "Hi",
        body: "{{unknown}}",
      }).success,
    ).toBe(false);
  });
  it("normalizes imports, handles quoted commas, flags duplicates and invalid emails", () => {
    const rows = parseContacts(
      'name,email,company,jobRole\nAlice, ALICE@example.com ,"Example, Inc",Engineer\nA,alice@example.com,X,Engineer\nB,bad,X,Engineer',
    );
    expect(rows.map((r) => r.state)).toEqual(["valid", "duplicate", "invalid"]);
    expect(rows[0].company).toBe("Example, Inc");
    expect(
      parseContacts(
        "name\temail\tcompany\tjobRole\nA\ta@example.com\tX\tEngineer",
        ["a@example.com"],
      )[0].state,
    ).toBe("duplicate");
  });
  it("rejects oversized imports and incomplete headers", () => {
    expect(() => parseContacts("x".repeat(1024 * 1024 + 1))).toThrow();
    expect(parseContacts("email\na@example.com")[0].state).toBe("invalid");
  });
  it("rejects 16 recipients and non-PDF files", () => {
    expect(
      campaignSchema.safeParse({
        templateId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        recipientIds: Array.from({ length: 16 }, () => crypto.randomUUID()),
        attachResume: false,
      }).success,
    ).toBe(false);
    expect(
      campaignSchema.safeParse({
        templateId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        recipientIds: Array.from({ length: 15 }, () => crypto.randomUUID()),
        attachResume: false,
      }).success,
    ).toBe(true);
    expect(() =>
      validatePdf(Buffer.from("not a pdf"), "application/pdf"),
    ).toThrow();
    expect(() =>
      validatePdf(Buffer.alloc(MAX_PDF_BYTES + 1), "application/pdf"),
    ).toThrow();
  });
});

describe("outreach preferences and email lists", () => {
  it("suggests editable first names conservatively", () => {
    expect(suggestName("alex.smith123@example.com")).toBe("Alex");
    expect(suggestName("sam123+jobs@example.com")).toBe("Sam");
    for (const value of ["careers", "hr", "info", "x", "1234"])
      expect(suggestName(value + "@example.com")).toBe("");
  });
  it("parses lists, validates unresolved names and roles, and deduplicates", () => {
    const rows = parseContacts(
      "alex@example.com; SAM@example.com,alex@example.com\ncareers@example.com",
      [],
      "Engineer",
    );
    expect(rows.map((r) => r.state)).toEqual([
      "valid",
      "valid",
      "duplicate",
      "invalid",
    ]);
    expect(rows[0].company).toBe("");
    const fixed = validateImportRows(
      rows.map((r) => ({ ...r, error: undefined, name: r.name || "Taylor" })),
    );
    expect(fixed[3].state).toBe("valid");
    expect(parseContacts("alex@example.com")[0].state).toBe("invalid");
  });
  it("validates preference count, case-insensitive uniqueness, and secure URLs", () => {
    for (const roles of [
      [],
      [""],
      ["Engineer", " engineer "],
      Array(6).fill("Engineer"),
    ])
      expect(preferredRolesSchema.safeParse(roles).success).toBe(false);
    expect(preferredRolesSchema.parse([" SDE Intern "])).toEqual([
      "SDE Intern",
    ]);
    for (const url of [
      "http://example.com",
      "javascript:alert(1)",
      "https://user:pass@example.com",
    ])
      expect(linkUrlSchema.safeParse(url).success).toBe(false);
    expect(linkUrlSchema.parse("https://example.com/portfolio")).toContain(
      "https:",
    );
    expect(linkUrlSchema.parse("")).toBe("");
  });
  it("allows links only in template bodies and renders literally", () => {
    expect(
      templateSchema.safeParse({
        name: "Portfolio",
        subject: "Hi",
        body: "{{link}}",
      }).success,
    ).toBe(true);
    expect(
      templateSchema.safeParse({
        name: "Portfolio",
        subject: "{{link}}",
        body: "Hi",
      }).success,
    ).toBe(false);
    expect(
      renderTemplate("{{link}}", {
        name: "A",
        role: "Engineer",
        link: "https://example.com/$&",
      }),
    ).toBe("https://example.com/$&");
  });
});

describe("approximate delivery estimates", () => {
  it("includes all outstanding jobs and the persisted next-send delay", () => {
    const now = Date.parse("2026-10-08T10:00:00Z");
    expect(remainingRange(4, "2026-10-08T10:02:00Z", now)).toEqual({
      min: 3,
      max: 6,
    });
    expect(remainingRange(0, null, now)).toBeNull();
    expect(remainingRange(1, null, now)).toEqual({ min: 1, max: 1 });
  });
});
