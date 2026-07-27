import { describe, expect, it } from "vitest";
import { actionForMenuId } from "../src/menu";

describe("actionForMenuId", () => {
  it("maps file menu ids to file actions", () => {
    expect(actionForMenuId("file.new")).toEqual({ kind: "new-file" });
    expect(actionForMenuId("file.open")).toEqual({ kind: "open-file" });
    expect(actionForMenuId("file.save")).toEqual({ kind: "save-file" });
    expect(actionForMenuId("file.save-as")).toEqual({ kind: "save-file-as" });
    expect(actionForMenuId("file.make-default")).toEqual({ kind: "make-default-app" });
  });

  it("maps paragraph menu ids to editor commands", () => {
    expect(actionForMenuId("paragraph.heading-1")).toEqual({
      kind: "editor-command",
      command: "heading-1",
    });
    expect(actionForMenuId("paragraph.heading-6")).toEqual({
      kind: "editor-command",
      command: "heading-6",
    });
    expect(actionForMenuId("paragraph.paragraph")).toEqual({
      kind: "editor-command",
      command: "paragraph",
    });
    expect(actionForMenuId("paragraph.heading-up")).toEqual({
      kind: "editor-command",
      command: "heading-up",
    });
    expect(actionForMenuId("paragraph.heading-down")).toEqual({
      kind: "editor-command",
      command: "heading-down",
    });
    expect(actionForMenuId("paragraph.table")).toEqual({
      kind: "editor-command",
      command: "table",
    });
    expect(actionForMenuId("paragraph.code-fence")).toEqual({
      kind: "editor-command",
      command: "code-fence",
    });
    expect(actionForMenuId("paragraph.quote")).toEqual({
      kind: "editor-command",
      command: "quote",
    });
    expect(actionForMenuId("paragraph.ordered-list")).toEqual({
      kind: "editor-command",
      command: "ordered-list",
    });
    expect(actionForMenuId("paragraph.unordered-list")).toEqual({
      kind: "editor-command",
      command: "bullet-list",
    });
    expect(actionForMenuId("paragraph.task-list")).toEqual({
      kind: "editor-command",
      command: "task-list",
    });
    expect(actionForMenuId("paragraph.hr")).toEqual({
      kind: "editor-command",
      command: "hr",
    });
  });

  it("maps format menu ids to editor commands", () => {
    expect(actionForMenuId("format.strong")).toEqual({
      kind: "editor-command",
      command: "strong",
    });
    expect(actionForMenuId("format.emphasis")).toEqual({
      kind: "editor-command",
      command: "emphasis",
    });
    expect(actionForMenuId("format.code")).toEqual({
      kind: "editor-command",
      command: "inline-code",
    });
    expect(actionForMenuId("format.strike")).toEqual({
      kind: "editor-command",
      command: "strike",
    });
    expect(actionForMenuId("format.link")).toEqual({
      kind: "editor-command",
      command: "link",
    });
    expect(actionForMenuId("format.clear")).toEqual({
      kind: "editor-command",
      command: "clear-format",
    });
  });

  it("maps view menu ids to source-mode and zoom actions", () => {
    expect(actionForMenuId("view.source-mode")).toEqual({ kind: "toggle-source-mode" });
    expect(actionForMenuId("view.zoom-in")).toEqual({ kind: "zoom", direction: "in" });
    expect(actionForMenuId("view.zoom-out")).toEqual({ kind: "zoom", direction: "out" });
    expect(actionForMenuId("view.zoom-reset")).toEqual({ kind: "zoom", direction: "reset" });
  });

  it("maps license, export, and view-mode menu ids", () => {
    expect(actionForMenuId("app.enter-license")).toEqual({ kind: "enter-license" });
    expect(actionForMenuId("app.check-updates")).toEqual({ kind: "check-updates" });
    expect(actionForMenuId("file.export-html")).toEqual({ kind: "export-html" });
    expect(actionForMenuId("file.export-pdf")).toEqual({ kind: "export-pdf" });
    expect(actionForMenuId("view.focus-mode")).toEqual({ kind: "toggle-focus-mode" });
    expect(actionForMenuId("view.typewriter-mode")).toEqual({
      kind: "toggle-typewriter-mode",
    });
    expect(actionForMenuId("view.float-on-top")).toEqual({ kind: "toggle-float" });
    expect(actionForMenuId("view.theme-paper")).toEqual({
      kind: "set-theme",
      theme: "paper",
    });
    expect(actionForMenuId("view.theme-night")).toEqual({
      kind: "set-theme",
      theme: "night",
    });
    expect(actionForMenuId("view.theme-newsprint")).toEqual({
      kind: "set-theme",
      theme: "newsprint",
    });
  });

  it("returns null for ids it does not own (e.g. predefined items)", () => {
    expect(actionForMenuId("undo")).toBeNull();
    expect(actionForMenuId("")).toBeNull();
    expect(actionForMenuId("file.export")).toBeNull();
  });
});
