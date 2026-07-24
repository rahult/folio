import { describe, expect, it } from "vitest";
import { canUse, isProFeature, looksLikeLicenseKey } from "../src/license";

describe("isProFeature", () => {
  it("marks the Pro feature set", () => {
    expect(isProFeature("export")).toBe(true);
    expect(isProFeature("focus-mode")).toBe(true);
    expect(isProFeature("typewriter-mode")).toBe(true);
    expect(isProFeature("themes")).toBe(true);
  });
});

describe("canUse", () => {
  it("gates Pro features behind a license", () => {
    expect(canUse("export", false)).toBe(false);
    expect(canUse("export", true)).toBe(true);
    expect(canUse("themes", false)).toBe(false);
    expect(canUse("themes", true)).toBe(true);
  });
});

describe("looksLikeLicenseKey", () => {
  const sig86 = "A".repeat(86);

  it("accepts a structurally valid key", () => {
    expect(looksLikeLicenseKey(`FOLIO1-eyJlbWFpbCI6ImFAYi5jIn0-${sig86}`)).toBe(true);
  });

  it("accepts base64url '-' and '_' inside segments", () => {
    // Sig segment = "-_" + 84 chars; payload contains "_". Parsing is
    // anchored on the fixed 86-char signature at the end.
    expect(looksLikeLicenseKey(`FOLIO1-abc_def--_${"A".repeat(84)}`)).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(looksLikeLicenseKey(`  FOLIO1-AAAA-${sig86}\n`)).toBe(true);
  });

  it("rejects wrong prefixes and segment shapes", () => {
    expect(looksLikeLicenseKey("")).toBe(false);
    expect(looksLikeLicenseKey("FOLIO2-AAAA-" + sig86)).toBe(false);
    expect(looksLikeLicenseKey("FOLIO1-AAAA")).toBe(false);
    // Signature must be exactly 86 chars.
    expect(looksLikeLicenseKey("FOLIO1-AAAA-" + "A".repeat(85))).toBe(false);
    expect(looksLikeLicenseKey("FOLIO1-AAAA-" + "A".repeat(87))).toBe(false);
    // Characters outside the base64url alphabet.
    expect(looksLikeLicenseKey("FOLIO1-AA!AA-" + sig86)).toBe(false);
  });
});
