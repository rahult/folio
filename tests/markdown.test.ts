import { describe, expect, it } from "vitest";
import {
  ensureTrailingNewline,
  fileNameFromPath,
  isMarkdownPath,
  normalizeMarkdown,
} from "../src/markdown";

describe("fileNameFromPath", () => {
  it("extracts the file name from a POSIX path", () => {
    expect(fileNameFromPath("/Users/a/notes/todo.md")).toBe("todo.md");
  });

  it("extracts the file name from a Windows-style path", () => {
    expect(fileNameFromPath("C:\\Users\\a\\todo.md")).toBe("todo.md");
  });

  it("handles a bare file name", () => {
    expect(fileNameFromPath("todo.md")).toBe("todo.md");
  });

  it("ignores trailing separators", () => {
    expect(fileNameFromPath("/some/dir/")).toBe("dir");
  });
});

describe("normalizeMarkdown", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeMarkdown("# a\r\n\r\nbody\r\n")).toBe("# a\n\nbody\n");
  });

  it("converts lone CR to LF", () => {
    expect(normalizeMarkdown("a\rb")).toBe("a\nb");
  });

  it("strips a leading BOM", () => {
    expect(normalizeMarkdown("\uFEFF# title")).toBe("# title");
  });

  it("leaves LF-only content untouched", () => {
    const md = "# a\n\n- one\n- two\n";
    expect(normalizeMarkdown(md)).toBe(md);
  });
});

describe("ensureTrailingNewline", () => {
  it("appends a newline when missing", () => {
    expect(ensureTrailingNewline("# a")).toBe("# a\n");
  });

  it("collapses trailing whitespace to a single newline", () => {
    expect(ensureTrailingNewline("# a\n\n\n  ")).toBe("# a\n");
  });

  it("returns an empty string for blank input", () => {
    expect(ensureTrailingNewline("   ")).toBe("");
  });
});

describe("isMarkdownPath", () => {
  it("accepts common markdown extensions", () => {
    expect(isMarkdownPath("a.md")).toBe(true);
    expect(isMarkdownPath("a.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("/x/y.mkd")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isMarkdownPath("a.txt")).toBe(false);
    expect(isMarkdownPath("a.mdx")).toBe(false);
  });
});
