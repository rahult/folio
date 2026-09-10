/**
 * Word export: Markdown → .docx, built from the same mdast the HTML export
 * uses, with the `docx` library. Headings, paragraphs with inline marks
 * and links, nested bullet/ordered/task lists, block quotes, code blocks,
 * tables, thematic breaks, and images the caller can supply as bytes.
 * Pure apart from the image hook; the bytes go to disk through Rust.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import type {
  Blockquote,
  Code,
  Heading,
  List,
  Paragraph as MdParagraph,
  PhrasingContent,
  Root,
  RootContent,
  Table as MdTable,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface DocxImage {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
}

export interface DocxHooks {
  /** Bytes for a local image, or null to leave a plain link in its place. */
  image(src: string): Promise<DocxImage | null>;
}

const PROSE = "Newsreader";
const MONO = "JetBrains Mono";
const INK = "3D362C";
const INK_SOFT = "6B6153";
const ACCENT = "7A3B2E";
const SUNKEN = "F2EEE4";
const HAIRLINE = "E2DDD2";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const BULLETS = "folio-bullets";
const NUMBERS = "folio-numbers";
/** Word wants distinct numbering instances so separate lists restart. */
let numberingInstance = 0;

interface Marks {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Build a Word document from Markdown. */
export async function buildDocx(markdown: string, title: string, hooks: DocxHooks): Promise<Uint8Array> {
  const root = parser.parse(markdown) as Root;
  numberingInstance = 0;
  const children: (Paragraph | Table)[] = [];
  for (const node of root.children) children.push(...(await block(node, hooks, 0)));
  if (children.length === 0) children.push(new Paragraph({}));

  const doc = new Document({
    title,
    creator: "Folio",
    styles: {
      default: {
        document: { run: { font: PROSE, size: 23, color: INK } },
        heading1: heading(44, 480, 160, true),
        heading2: heading(34, 400, 120, true),
        heading3: heading(28, 320, 100, false, true),
        heading4: heading(24, 280, 80, true),
        heading5: heading(23, 240, 80, true),
        heading6: heading(23, 240, 80, true),
      },
      paragraphStyles: [
        {
          id: "FolioQuote",
          name: "Folio Quote",
          basedOn: "Normal",
          run: { italics: true, color: INK_SOFT },
          paragraph: {
            indent: { left: 480 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
            spacing: { before: 120, after: 120 },
          },
        },
        {
          id: "FolioCode",
          name: "Folio Code",
          basedOn: "Normal",
          run: { font: MONO, size: 18 },
          paragraph: {
            shading: { type: ShadingType.CLEAR, fill: SUNKEN },
            spacing: { before: 0, after: 0, line: 300 },
            indent: { left: 200, right: 200 },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: level % 2 === 0 ? "•" : "◦",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
        ...Array.from({ length: numberingInstance + 1 }, (_, i) => ({
          reference: `${NUMBERS}-${i}`,
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        })),
      ],
    },
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function heading(size: number, before: number, after: number, bold: boolean, italics = false) {
  return {
    run: { font: PROSE, size, bold, italics, color: INK },
    paragraph: { spacing: { before, after } },
  };
}

async function block(
  node: RootContent,
  hooks: DocxHooks,
  depth: number,
  list?: { reference: string; level: number },
): Promise<(Paragraph | Table)[]> {
  switch (node.type) {
    case "heading": {
      const h = node as Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVELS[Math.min(h.depth, 6) - 1],
          children: await inline(h.children, hooks, {}),
        }),
      ];
    }
    case "paragraph": {
      const p = node as MdParagraph;
      const options: IParagraphOptions = list
        ? { numbering: { reference: list.reference, level: Math.min(list.level, 3) } }
        : { spacing: { after: 200 } };
      return [new Paragraph({ ...options, children: await inline(p.children, hooks, {}) })];
    }
    case "blockquote": {
      const out: (Paragraph | Table)[] = [];
      for (const child of (node as Blockquote).children) {
        for (const built of await block(child, hooks, depth + 1)) {
          if (built instanceof Paragraph) out.push(restyle(built, "FolioQuote"));
          else out.push(built);
        }
      }
      return out;
    }
    case "code": {
      const code = node as Code;
      const lines = code.value.split("\n");
      return [
        ...lines.map(
          (line, i) =>
            new Paragraph({
              style: "FolioCode",
              spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 200 : 0 },
              children: [new TextRun({ text: line || " ", font: MONO })],
            }),
        ),
      ];
    }
    case "list": {
      const l = node as List;
      const reference = l.ordered ? `${NUMBERS}-${numberingInstance++}` : BULLETS;
      const out: (Paragraph | Table)[] = [];
      for (const item of l.children) {
        let first = true;
        for (const child of item.children) {
          if (child.type === "paragraph" && first) {
            const runs = await inline(child.children, hooks, {});
            if (item.checked !== null && item.checked !== undefined) {
              runs.unshift(new TextRun({ text: item.checked ? "☑ " : "☐ " }));
            }
            out.push(
              new Paragraph({
                numbering: { reference, level: Math.min(depth, 3) },
                spacing: { after: l.spread ? 120 : 40 },
                children: runs,
              }),
            );
          } else if (child.type === "list") {
            out.push(...(await block(child, hooks, depth + 1)));
          } else {
            out.push(...(await block(child, hooks, depth + 1, { reference, level: depth })));
          }
          first = false;
        }
      }
      return out;
    }
    case "table":
      return [await table(node as MdTable, hooks)];
    case "thematicBreak":
      return [
        new Paragraph({
          spacing: { before: 240, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HAIRLINE, space: 1 } },
          children: [],
        }),
      ];
    case "html":
      return [new Paragraph({ children: [new TextRun({ text: node.value, font: MONO, size: 18 })] })];
    default:
      return [];
  }
}

/** docx paragraphs are immutable once built; rebuild one with a style. */
function restyle(paragraph: Paragraph, style: string): Paragraph {
  return new Paragraph({ style, children: extractRuns(paragraph) });
}

function extractRuns(paragraph: Paragraph): ParagraphChild[] {
  // The library keeps children on `root` after the properties element.
  const root = (paragraph as unknown as { root: unknown[] }).root;
  return root.slice(1) as ParagraphChild[];
}

async function table(node: MdTable, hooks: DocxHooks): Promise<Table> {
  const rows: TableRow[] = [];
  for (let r = 0; r < node.children.length; r++) {
    const row = node.children[r];
    const cells: TableCell[] = [];
    for (let c = 0; c < row.children.length; c++) {
      const cell = row.children[c];
      const align = node.align?.[c];
      cells.push(
        new TableCell({
          shading: r === 0 ? { type: ShadingType.CLEAR, fill: SUNKEN } : undefined,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment:
                align === "center" ? AlignmentType.CENTER : align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: await inline(cell.children, hooks, r === 0 ? { bold: true } : {}),
            }),
          ],
        }),
      );
    }
    rows.push(new TableRow({ children: cells, tableHeader: r === 0 }));
  }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      left: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
      right: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
    },
  });
}

async function inline(nodes: PhrasingContent[], hooks: DocxHooks, marks: Marks): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out.push(run(node.value, marks));
        break;
      case "emphasis":
        out.push(...(await inline(node.children, hooks, { ...marks, italics: true })));
        break;
      case "strong":
        out.push(...(await inline(node.children, hooks, { ...marks, bold: true })));
        break;
      case "delete":
        out.push(...(await inline(node.children, hooks, { ...marks, strike: true })));
        break;
      case "inlineCode":
        out.push(run(node.value, { ...marks, code: true }));
        break;
      case "break":
        out.push(new TextRun({ break: 1 }));
        break;
      case "link":
        out.push(
          new ExternalHyperlink({
            link: node.url,
            children: (await inline(node.children, hooks, marks)).map((child) =>
              child instanceof TextRun ? child : run(node.url, marks),
            ),
          }),
        );
        break;
      case "image": {
        const image = await hooks.image(node.url);
        if (image) {
          const { width, height } = fit(image.width, image.height, 600);
          out.push(
            new ImageRun({
              type: image.type,
              data: image.data,
              transformation: { width, height },
              altText: { title: node.alt ?? "", description: node.alt ?? "", name: node.alt ?? "image" },
            }),
          );
        } else {
          out.push(
            new ExternalHyperlink({
              link: node.url,
              children: [run(node.alt || node.url, marks)],
            }),
          );
        }
        break;
      }
      default:
        if ("children" in node) out.push(...(await inline(node.children as PhrasingContent[], hooks, marks)));
        else if ("value" in node) out.push(run(String(node.value), marks));
    }
  }
  return out;
}

function run(text: string, marks: Marks): TextRun {
  return new TextRun({
    text,
    bold: marks.bold,
    italics: marks.italics,
    strike: marks.strike,
    font: marks.code ? MONO : undefined,
    size: marks.code ? 19 : undefined,
    shading: marks.code ? { type: ShadingType.CLEAR, fill: SUNKEN } : undefined,
    color: undefined,
  });
}

/** Scale to a maximum width in points, preserving the aspect ratio. */
function fit(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxWidth };
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}
