import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { renderTemplate, templateSchema, campaignSchema, validatePdf, MAX_PDF_BYTES } from "@/lib/validation";
import { parseContacts } from "@/lib/imports";

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
    expect(renderTemplate("Hi {{ name }}, {{company}} / {{role}}", { name: "$&", company: null, role: "Engineer" })).toBe("Hi $&,  / Engineer");
  });
  it("rejects unknown placeholders and injected headers", () => {
    expect(templateSchema.safeParse({ name: "Test", subject: "Hi\r\nBcc: bad@example.com", body: "Hello" }).success).toBe(false);
    expect(templateSchema.safeParse({ name: "Test", subject: "Hi", body: "{{unknown}}" }).success).toBe(false);
  });
  it("normalizes imports, handles quoted commas, flags duplicates and invalid emails", () => {
    const rows = parseContacts('name,email,company\nAlice, ALICE@example.com ,"Example, Inc"\nA,alice@example.com,X\nB,bad,X');
    expect(rows.map(r => r.state)).toEqual(["valid", "duplicate", "invalid"]);
    expect(rows[0].company).toBe("Example, Inc");
    expect(parseContacts("name\temail\tcompany\nA\ta@example.com\tX", ["a@example.com"])[0].state).toBe("duplicate");
  });
  it("rejects oversized imports and incomplete headers", () => {
    expect(() => parseContacts("x".repeat(1024 * 1024 + 1))).toThrow();
    expect(() => parseContacts("email\na@example.com")).toThrow();
  });
  it("rejects 16 recipients and non-PDF files", () => {
    expect(campaignSchema.safeParse({ templateId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), recipientIds: Array.from({ length: 16 }, () => crypto.randomUUID()) }).success).toBe(false);
    expect(() => validatePdf(Buffer.from("not a pdf"), "application/pdf")).toThrow();
    expect(() => validatePdf(Buffer.alloc(MAX_PDF_BYTES + 1), "application/pdf")).toThrow();
  });
});
