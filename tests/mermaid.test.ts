import { describe, expect, it } from "vitest";
import { mermaidRenderPreview } from "../src/mermaid";

describe("mermaidRenderPreview", () => {
  it("ignores non-mermaid languages", () => {
    let called = false;
    const result = mermaidRenderPreview("rust", "fn main() {}", () => {
      called = true;
    });
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("defers mermaid rendering to the async applyPreview callback", () => {
    const result = mermaidRenderPreview("mermaid", "graph TD; A-->B", () => {});
    // undefined signals async rendering to the code-block component
    expect(result).toBeUndefined();
  });
});
