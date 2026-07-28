import { describe, expect, it } from "vitest";
import { classifyLink, normalizePath, resolveRelativePath } from "../src/links";

const BASE = "/docs/plans/migration.md";

describe("normalizePath", () => {
  it("collapses dot and dot-dot segments", () => {
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
    expect(normalizePath("/a/./b/./c")).toBe("/a/b/c");
    expect(normalizePath("/a/b/../../c")).toBe("/c");
  });
});

describe("resolveRelativePath", () => {
  it("resolves same-dir and parent-relative links", () => {
    expect(resolveRelativePath(BASE, "other.md")).toBe("/docs/plans/other.md");
    expect(resolveRelativePath(BASE, "./other.md")).toBe("/docs/plans/other.md");
    expect(resolveRelativePath(BASE, "../notes/todo.md")).toBe("/docs/notes/todo.md");
  });

  it("passes absolute paths through normalized", () => {
    expect(resolveRelativePath(BASE, "/etc/./config.md")).toBe("/etc/config.md");
  });
});

describe("classifyLink", () => {
  it("routes relative markdown links into the app", () => {
    expect(classifyLink("other.md", BASE)).toEqual({
      kind: "markdown",
      path: "/docs/plans/other.md",
    });
    expect(classifyLink("./a.MD", BASE)).toEqual({ kind: "markdown", path: "/docs/plans/a.MD" });
  });

  it("strips anchors and query strings before resolving", () => {
    expect(classifyLink("other.md#section", BASE)).toEqual({
      kind: "markdown",
      path: "/docs/plans/other.md",
    });
  });

  it("treats in-document anchors as anchors", () => {
    expect(classifyLink("#heading", BASE)).toEqual({ kind: "anchor" });
  });

  it("routes web and mail URLs to the default application", () => {
    expect(classifyLink("https://example.com/x", BASE)).toEqual({
      kind: "external-url",
      url: "https://example.com/x",
    });
    expect(classifyLink("mailto:a@b.c", BASE)).toEqual({
      kind: "external-url",
      url: "mailto:a@b.c",
    });
  });

  it("routes non-markdown local files to the default application", () => {
    expect(classifyLink("./diagram.png", BASE)).toEqual({
      kind: "external-path",
      path: "/docs/plans/diagram.png",
    });
    expect(classifyLink("/tmp/spec.pdf", BASE)).toEqual({
      kind: "external-path",
      path: "/tmp/spec.pdf",
    });
  });

  it("handles file:// URLs by their underlying path", () => {
    expect(classifyLink("file:///docs/a.md", BASE)).toEqual({
      kind: "markdown",
      path: "/docs/a.md",
    });
  });

  it("rejects relative links from an untitled document", () => {
    expect(classifyLink("other.md", null)).toEqual({ kind: "invalid" });
    // …but absolute and external links still work
    expect(classifyLink("/tmp/a.md", null)).toEqual({ kind: "markdown", path: "/tmp/a.md" });
    expect(classifyLink("https://x.dev", null)).toEqual({
      kind: "external-url",
      url: "https://x.dev",
    });
  });
});
