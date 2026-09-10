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
import {
  columnResizingPlugin,
  insertTableCommand,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import { adjustHeadingLevel, type EditorCommand, type HeadingDirection } from "./commands";
import { diffViewPlugin } from "./diffview";
import { annotationPlugin } from "./annotview";
import { reviewViewPlugin } from "./reviewview";
import { mermaidRenderPreview } from "./mermaid";
import { alnumCount, positionForAnchor, type CaretAnchor, type TextSegment } from "./caretmap";
import { TextSelection } from "@milkdown/kit/prose/state";

export interface MarkdownEditorOptions {
  /** Maps an image's Markdown src to the URL the <img> should display
   *  (display only — the serialized Markdown keeps the original src). */
  resolveImageSrc?: (src: string) => string;
}

/** Speech-bubble icon for the selection toolbar's annotate action (feather
 *  "message-square", stroke style matching Crepe's built-in icons). */
const ANNOTATE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

/**
 * Thin wrapper around the Crepe WYSIWYG markdown editor.
 * Crepe has no "set content" API, so replacing the document is done by
 * destroying and recreating the editor instance — that is encapsulated here.
 */
export class MarkdownEditor {
  private crepe: Crepe | null = null;
  private selectionCb: (() => void) | null = null;
  private annotateCb: (() => void) | null = null;

  constructor(
    private root: HTMLElement,
    private onMarkdownUpdated: (markdown: string) => void,
    private options: MarkdownEditorOptions = {},
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
        [Crepe.Feature.CodeMirror]: {
          // Mermaid blocks render as diagrams (preview-only by default);
          // the Edit/Hide toggle is the click-to-edit surface.
          renderPreview: mermaidRenderPreview,
          previewOnlyByDefault: true,
          previewLabel: "Diagram",
        },
        [Crepe.Feature.ImageBlock]: {
          // Relative image paths resolve against the open file, not the
          // webview origin; see src/images.ts.
          proxyDomURL: this.options.resolveImageSrc,
        },
        [Crepe.Feature.Toolbar]: {
          // Append an annotate action to the selection bubble: same flow as
          // Edit → Annotate Selection…, one click instead of a menu trip.
          buildToolbar: (builder) => {
            builder.getGroup("function").addItem("annotate", {
              icon: ANNOTATE_ICON,
              active: () => false,
              onRun: () => {
                this.annotateCb?.();
              },
            });
          },
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

    // GFM's column-resizing plugin is exported but not part of the preset's
    // default plugin set — enable it so table columns drag to resize.
    this.crepe.editor.use(columnResizingPlugin);
    // Decoration host for the rewrite diff view (agent review highlights).
    this.crepe.editor.use(diffViewPlugin);
    // Decoration host for review annotations (comments, deletions,
    // replacements on the document being reviewed).
    this.crepe.editor.use(annotationPlugin);
    // Review Mode: read-only page, current-block rule, inline entry field.
    this.crepe.editor.use(reviewViewPlugin);

    await this.crepe.create();
  }

  /** Register a callback fired on every ProseMirror selection update.
   *  Re-registered automatically when the editor is recreated. */
  onSelectionUpdate(cb: () => void): void {
    this.selectionCb = cb;
  }

  /** Register the action behind the selection toolbar's annotate icon. */
  onAnnotateRequest(cb: () => void): void {
    this.annotateCb = cb;
  }

  /** Run `fn` against the live ProseMirror view. A no-op before create and
   *  during it: Crepe fires selection/markdown callbacks while the view is
   *  still being mounted, when the context has no view to hand out yet. */
  withView(fn: (view: EditorView) => void): void {
    if (!this.crepe) return;
    this.crepe.editor.action((ctx) => {
      let view: EditorView;
      try {
        view = ctx.get(editorViewCtx);
      } catch {
        return;
      }
      // Milkdown's context slice holds a placeholder object until the real
      // view is mounted; only a view with state is usable.
      if (!view || !view.state) return;
      fn(view);
    });
  }

  /** Where the caret is, in view-independent terms (see src/caretmap.ts);
   *  null before create. */
  caretAnchor(): CaretAnchor | null {
    let anchor: CaretAnchor | null = null;
    this.withView((view) => {
      const { doc } = view.state;
      const { $from } = view.state.selection;
      if ($from.depth === 0) {
        // Between top-level blocks: anchor to the start of the block after.
        anchor = { block: Math.min($from.index(0), Math.max(0, doc.childCount - 1)), alnum: 0, wordStart: false };
        return;
      }
      const block = $from.index(0);
      const before = doc.textBetween($from.start(1), $from.pos, "\n");
      const after = doc.textBetween($from.pos, $from.end(1), "\n");
      anchor = {
        block,
        alnum: alnumCount(before),
        wordStart: after.length > 0 && alnumCount([...after][0]) === 1,
      };
    });
    return anchor;
  }

  /** Put the caret at an anchor (clamped to the document) and scroll to it. */
  setCaretAnchor(anchor: CaretAnchor): void {
    this.withView((view) => {
      const { doc } = view.state;
      if (doc.childCount === 0) return;
      const block = Math.min(Math.max(0, anchor.block), doc.childCount - 1);
      let before = 0;
      for (let i = 0; i < block; i++) before += doc.child(i).nodeSize;
      const node = doc.child(block);
      const segments: TextSegment[] = [];
      node.descendants((child, pos) => {
        if (child.isText) segments.push({ pmFrom: before + 1 + pos, text: child.text ?? "" });
        return true;
      });
      const pos = Math.min(positionForAnchor(segments, anchor, before + 1), doc.content.size);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))).scrollIntoView(),
      );
      view.focus();
    });
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
