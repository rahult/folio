import { describe, expect, it } from "vitest";
import { attribute, type Attributed } from "../src/provenance";

const join = (spans: Attributed[]) => spans.map((s) => `${s.origin[0]}:${s.text}`).join("|");

describe("attribute", () => {
  it("marks every word of a lone external revision external, and live edits folio", () => {
    const out = attribute([{ rendered: "The plan ships", origin: "external" }], "The plan ships today");
    expect(join(out)).toBe("e:The plan ships|f: today");
  });

  it("keeps unchanged words' origin across revisions and attributes additions to each", () => {
    const out = attribute(
      [
        { rendered: "alpha beta", origin: "unknown" },
        { rendered: "alpha beta gamma", origin: "external" },
        { rendered: "alpha delta gamma", origin: "folio" },
      ],
      "alpha delta gamma",
    );
    expect(join(out)).toBe("u:alpha |f:delta|e: gamma");
  });

  it("marks only the first rewrite after a change request as revision", () => {
    const out = attribute(
      [
        { rendered: "ship to all users", origin: "external" },
        { rendered: "ship to ten percent", origin: "revision" },
      ],
      "ship to ten percent",
    );
    expect(join(out)).toBe("e:ship to |r:ten percent");
  });

  it("merges runs and treats an empty archive as unknown", () => {
    expect(join(attribute([], "just typed"))).toBe("f:just typed");
    const out = attribute([{ rendered: "a b c", origin: "external" }], "a b c");
    expect(out).toHaveLength(1);
  });

  it("returns the live text exactly when concatenated", () => {
    const live = "one two three four";
    const out = attribute([{ rendered: "one three", origin: "external" }], live);
    expect(out.map((s) => s.text).join("")).toBe(live);
  });
});
