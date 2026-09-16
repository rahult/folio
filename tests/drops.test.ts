import { describe, expect, it } from "vitest";
import { markdownDrops } from "../src/drops";

describe("markdownDrops", () => {
  it("keeps the Markdown files, in drop order", () => {
    expect(
      markdownDrops(["docs/b.md", "docs/a.md", "docs/c.markdown", "docs/d.mdown", "docs/e.mkd"]),
    ).toEqual(["docs/b.md", "docs/a.md", "docs/c.markdown", "docs/d.mdown", "docs/e.mkd"]);
  });

  it("ignores case and everything that is not a Markdown file", () => {
    expect(markdownDrops(["Notes.MD", "IMG_2041.png", "report.pdf", "folder.md/"])).toEqual([
      "Notes.MD",
    ]);
  });

  it("drops nothing there is nothing to keep", () => {
    expect(markdownDrops([])).toEqual([]);
    expect(markdownDrops(["styles.css", "data.json"])).toEqual([]);
  });
});
