import { describe, expect, it } from "vitest";
import { DocumentState } from "../src/document";

describe("DocumentState", () => {
  it("starts as an untitled, clean document", () => {
    const doc = new DocumentState();
    expect(doc.filePath).toBeNull();
    expect(doc.fileName).toBe("Untitled");
    expect(doc.dirty).toBe(false);
    expect(doc.displayTitle).toBe("Untitled");
  });

  it("tracks the path and file name after loading a file", () => {
    const doc = new DocumentState();
    doc.load("/Users/a/notes/todo.md", "# Todo\n");
    expect(doc.filePath).toBe("/Users/a/notes/todo.md");
    expect(doc.fileName).toBe("todo.md");
    expect(doc.dirty).toBe(false);
    expect(doc.displayTitle).toBe("todo.md");
  });

  it("becomes dirty when content diverges from the saved content", () => {
    const doc = new DocumentState();
    doc.load("/a/b.md", "original");
    expect(doc.updateDirty("original")).toBe(false);
    expect(doc.updateDirty("original plus edits")).toBe(true);
    expect(doc.dirty).toBe(true);
    expect(doc.displayTitle).toBe("• b.md");
  });

  it("becomes clean again when content returns to the saved version", () => {
    const doc = new DocumentState();
    doc.load("/a/b.md", "original");
    doc.updateDirty("edited");
    expect(doc.dirty).toBe(true);
    doc.updateDirty("original");
    expect(doc.dirty).toBe(false);
  });

  it("clears the dirty flag when marked saved with current content", () => {
    const doc = new DocumentState();
    doc.load("/a/b.md", "original");
    doc.updateDirty("edited");
    doc.markSaved("edited");
    expect(doc.dirty).toBe(false);
    // And the new baseline is "edited":
    expect(doc.updateDirty("edited")).toBe(false);
  });

  it("updates the displayed file name after setPath (Save As)", () => {
    const doc = new DocumentState();
    doc.load(null, "");
    doc.setPath("/a/new-name.md");
    expect(doc.filePath).toBe("/a/new-name.md");
    expect(doc.fileName).toBe("new-name.md");
  });
});
