import { describe, expect, it } from "vitest";
import { localImagePath, resolveImageSrc } from "../src/images";

const BASE = "/docs/plans/migration.md";
const toAsset = (path: string) => `asset://localhost${path}`;

describe("localImagePath", () => {
  it("resolves a relative src against the document's folder", () => {
    expect(localImagePath("test-image.svg", BASE)).toBe("/docs/plans/test-image.svg");
    expect(localImagePath("./img/a.png", BASE)).toBe("/docs/plans/img/a.png");
    expect(localImagePath("../shared/logo.png", BASE)).toBe("/docs/shared/logo.png");
  });

  it("accepts absolute and file:// paths", () => {
    expect(localImagePath("/tmp/x.png", BASE)).toBe("/tmp/x.png");
    expect(localImagePath("file:///tmp/x.png", BASE)).toBe("/tmp/x.png");
    expect(localImagePath("file:///tmp/x.png", null)).toBe("/tmp/x.png");
  });

  it("decodes percent-encoded path segments", () => {
    expect(localImagePath("my%20image.png", BASE)).toBe("/docs/plans/my image.png");
  });

  it("refuses anything that is not an image file", () => {
    // A document can name any path; only image files may be resolved
    // (and, on export, embedded) through the asset protocol.
    expect(localImagePath("../.ssh/id_rsa", BASE)).toBeNull();
    expect(localImagePath("/etc/passwd", BASE)).toBeNull();
    expect(localImagePath("notes.md", BASE)).toBeNull();
    expect(localImagePath("photo.JPG", BASE)).toBe("/docs/plans/photo.JPG");
    expect(localImagePath("pic.webp?v=2", BASE)).toBe("/docs/plans/pic.webp");
  });

  it("returns null for remote, data, and unresolvable srcs", () => {
    expect(localImagePath("https://example.com/a.png", BASE)).toBeNull();
    expect(localImagePath("data:image/png;base64,AAAA", BASE)).toBeNull();
    expect(localImagePath("blob:abc", BASE)).toBeNull();
    expect(localImagePath("", BASE)).toBeNull();
    // Relative to nothing: an untitled document has no folder.
    expect(localImagePath("test-image.svg", null)).toBeNull();
  });
});

describe("resolveImageSrc", () => {
  it("routes local images through the asset converter", () => {
    expect(resolveImageSrc("test-image.svg", BASE, toAsset)).toBe(
      "asset://localhost/docs/plans/test-image.svg",
    );
  });

  it("leaves everything else untouched", () => {
    expect(resolveImageSrc("https://example.com/a.png", BASE, toAsset)).toBe(
      "https://example.com/a.png",
    );
    expect(resolveImageSrc("test-image.svg", null, toAsset)).toBe("test-image.svg");
  });
});
