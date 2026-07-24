import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

/**
 * Thin wrapper around the Crepe WYSIWYG markdown editor.
 * Crepe has no "set content" API, so replacing the document is done by
 * destroying and recreating the editor instance — that is encapsulated here.
 */
export class MarkdownEditor {
  private crepe: Crepe | null = null;

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
    });

    await this.crepe.create();
  }

  /** Replace the entire document content. */
  async setContent(markdown: string): Promise<void> {
    await this.create(markdown);
  }

  /** Current document serialized back to markdown. */
  getMarkdown(): string {
    return this.crepe ? this.crepe.getMarkdown() : "";
  }

  async destroy(): Promise<void> {
    if (this.crepe) {
      await this.crepe.destroy();
      this.crepe = null;
    }
  }
}
