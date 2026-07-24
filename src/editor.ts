import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
  blockquoteSchema,
  bulletListSchema,
  createCodeBlockCommand,
  headingSchema,
  insertHrCommand,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import { adjustHeadingLevel, type EditorCommand, type HeadingDirection } from "./commands";

/**
 * Thin wrapper around the Crepe WYSIWYG markdown editor.
 * Crepe has no "set content" API, so replacing the document is done by
 * destroying and recreating the editor instance — that is encapsulated here.
 */
export class MarkdownEditor {
  private crepe: Crepe | null = null;
  private selectionCb: (() => void) | null = null;

  constructor(
    private root: HTMLElement,
    private onMarkdownUpdated: (markdown: string) => void,
  ) {}

  /** Create (or recreate) the editor with the given markdown content. */
  async create(markdown: string): Promise<void> {
    await this.destroy();
    this.root.innerHTML = "";

    this.crepe = new Crepe({
      root: this.root,
      defaultValue: markdown,
      features: {
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start writing — or press ⌘O to open a file",
          mode: "doc",
        },
      },
    });

    this.crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        this.onMarkdownUpdated(markdown);
      });
      api.selectionUpdated(() => {
        this.selectionCb?.();
      });
    });

    await this.crepe.create();
  }

  /** Register a callback fired on every ProseMirror selection update.
   *  Re-registered automatically when the editor is recreated. */
  onSelectionUpdate(cb: () => void): void {
    this.selectionCb = cb;
  }

  /** Run `fn` against the live ProseMirror view (no-op before create). */
  withView(fn: (view: EditorView) => void): void {
    if (!this.crepe) return;
    this.crepe.editor.action((ctx) => {
      fn(ctx.get(editorViewCtx));
    });
  }

  /** The rendered document as clean HTML, for export: editing artifacts
   *  (contenteditable, trailing breaks, placeholder widgets) removed. */
  exportHtml(): string {
    const live = this.root.querySelector(".milkdown");
    if (!live) return "";
    const clone = live.cloneNode(true) as HTMLElement;
    clone.removeAttribute("contenteditable");
    for (const el of clone.querySelectorAll("[contenteditable]")) {
      el.removeAttribute("contenteditable");
    }
    for (const el of clone.querySelectorAll(".ProseMirror-trailingBreak, .crepe-placeholder")) {
      el.remove();
    }
    return clone.outerHTML;
  }

  /** Replace the entire document content. */
  async setContent(markdown: string): Promise<void> {
    await this.create(markdown);
  }

  /** Current document serialized back to markdown. */
  getMarkdown(): string {
    return this.crepe ? this.crepe.getMarkdown() : "";
  }

  /** Run a menu command against the live editor (no-op before create). */
  runCommand(command: EditorCommand): void {
    if (!this.crepe) return;
    this.crepe.editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      const headingMatch = /^heading-([1-6])$/.exec(command);
      if (headingMatch) {
        commands.call(setBlockTypeCommand.key, {
          nodeType: headingSchema.type(ctx),
          attrs: { level: Number(headingMatch[1]) },
        });
        return;
      }
      switch (command) {
        case "strong":
          commands.call(toggleStrongCommand.key);
          break;
        case "emphasis":
          commands.call(toggleEmphasisCommand.key);
          break;
        case "inline-code":
          commands.call(toggleInlineCodeCommand.key);
          break;
        case "strike":
          commands.call(toggleStrikethroughCommand.key);
          break;
        case "link":
          // Wrap the selection in a placeholder link; the link tooltip
          // feature then lets the user edit the URL (no window.prompt).
          commands.call(toggleLinkCommand.key, { href: "https://" });
          break;
        case "clear-format":
          clearFormat(ctx);
          break;
        case "paragraph":
          commands.call(setBlockTypeCommand.key, {
            nodeType: paragraphSchema.type(ctx),
          });
          break;
        case "heading-up":
          adjustHeading(ctx, "up");
          break;
        case "heading-down":
          adjustHeading(ctx, "down");
          break;
        case "quote":
          commands.call(wrapInBlockTypeCommand.key, {
            nodeType: blockquoteSchema.type(ctx),
          });
          break;
        case "bullet-list":
          commands.call(wrapInBlockTypeCommand.key, {
            nodeType: bulletListSchema.type(ctx),
          });
          break;
        case "ordered-list":
          commands.call(wrapInBlockTypeCommand.key, {
            nodeType: orderedListSchema.type(ctx),
          });
          break;
        case "task-list":
          // Same recipe Crepe's block-edit menu uses: wrapping in a
          // list_item with checked:false produces a task list.
          commands.call(wrapInBlockTypeCommand.key, {
            nodeType: listItemSchema.type(ctx),
            attrs: { checked: false },
          });
          break;
        case "code-fence":
          commands.call(createCodeBlockCommand.key);
          break;
        case "table":
          commands.call(insertTableCommand.key, { row: 2, col: 3 });
          break;
        case "hr":
          commands.call(insertHrCommand.key);
          break;
      }
    });
  }

  async destroy(): Promise<void> {
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
  }
}

/** Current heading level at the selection, or null for non-heading blocks. */
function headingLevelAtSelection(ctx: Ctx): number | null {
  const view = ctx.get(editorViewCtx);
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "heading") return node.attrs.level as number;
  }
  return null;
}

/** Increase/decrease the heading level of the block at the selection. */
function adjustHeading(ctx: Ctx, direction: HeadingDirection): void {
  const next = adjustHeadingLevel(headingLevelAtSelection(ctx), direction);
  const commands = ctx.get(commandsCtx);
  commands.call(
    setBlockTypeCommand.key,
    next === null
      ? { nodeType: paragraphSchema.type(ctx) }
      : { nodeType: headingSchema.type(ctx), attrs: { level: next } },
  );
}

/** Clear Format: strip all inline marks in the selection and demote
 *  headings back to plain paragraphs (Typora behavior). */
function clearFormat(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.removeMark(from, to));
  ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
    nodeType: paragraphSchema.type(ctx),
  });
}
