# Markdown editor landscape, September 2026

A survey of the Markdown editors and writing/reading apps Folio competes with or borrows
from, written to answer one question: which features and interaction ideas would make
Folio the best Markdown editor, given what it already has (Milkdown WYSIWYG plus source
mode, tabs, five themes, focus/typewriter, HTML/PDF export with embedded fonts and
Mermaid, the `folio review --wait` agent loop with inline annotations and feedback
files, the reading panel with outline and takeaway). It updates the market table at the
top of [docs/ROADMAP.md](../ROADMAP.md), which was compiled from secondary reviews; this
file prefers each product's own site, help pages, changelog, or repository, and flags
where only secondary sources were available. Prices are as read from the vendor's
pricing page or App Store listing on 2026-09-11.

## Typora

- What it is: proprietary desktop editor for macOS, Windows, Linux. The Windows/Linux builds run on
  Electron (the project maintains its own Electron fork at
  [github.com/typora/electron](https://github.com/typora/electron); see the [Linux install
  page](https://support.typora.io/Typora-on-Linux/)); the macOS build is a native shell. Closed
  source; open-sourcing requests are closed as wontfix ([typora-issues
  #16](https://github.com/typora/typora-issues/issues/16)).
- Editing: the reference implementation of "seamless" WYSIWYG that Folio's README names. Tables,
  task lists, ~100-language code highlighting, MathJax with mhchem/AMSmath, Mermaid, flowchart.js
  and sequence diagrams; v1.13 added Venn and Ishikawa diagram types ([What's New
  1.13](https://support.typora.io/What's-New-1.13/)); v1.14 (July 19, 2026) added a floating editor
  toolbar and file-type filtering in the sidebar ([What's New
  1.14](https://support.typora.io/What's-New-1.14/)). Focus and typewriter modes, auto-pairing
  ([typora.io](https://typora.io)).
- Navigation: file tree and file list side panels, an outline panel from headings, header anchors
  for internal links ([typora.io](https://typora.io)).
- Export: PDF (with bookmarks), DOCX, ODT, LaTeX, MediaWiki, EPUB ([typora.io](https://typora.io)).
  Pandoc is required for the non-HTML/PDF formats.
- Review/collaboration: none. Version history is the macOS Versions browser on Mac; Windows/Linux
  get only autosave drafts ([Version Control](https://support.typora.io/Version-Control/)).
- Reading aids: word/character/line counts and a reading-time estimate
  ([typora.io](https://typora.io)).
- Theming: CSS themes; users drop `.css` files into the theme folder
  ([typora.io](https://typora.io)).
- Price: $14.99 one-time, three devices, 15-day trial ([typora.io/#buy](https://typora.io/#buy)).
  Latest stable 1.14.x ([releases](https://typora.io/releases/stable.html)).

## iA Writer

- What it is: native, closed-source apps sold separately per platform: macOS, iOS/iPadOS, Windows,
  Android. No Linux, no web ([pricing](https://ia.net/writer/pricing)).
- Editing: plain-text Markdown with syntax highlighting, not WYSIWYG. Focus mode dims all but the
  current sentence/paragraph. Syntax Highlight colours parts of speech. Style Check flags clichés,
  fillers and redundancies on-device ([ia.net/writer](https://ia.net/writer)). Content Blocks embed
  other files, CSV tables and images by path; smart tables with calculations
  ([features](https://ia.net/writer/support/basics/features)).
- Authorship (v7): each span of text carries a provenance. Your words render black, pasted or AI
  text grey; "Edit → Paste Edits From AI" diffs an AI rewrite against your draft and shows what was
  kept vs changed; everything is computed locally
  ([Authorship](https://ia.net/writer/support/editor/authorship), [Track Authors and
  AI](https://ia.net/writer/how-to/track-authors-and-ai)). v7.3 adds per-contributor colours
  ([version history](https://ia.net/writer/support/help/version-history)). This is the closest any
  mainstream editor comes to Folio's rewrite-diff view, and it is manual where Folio's is automatic.
- Navigation: `[[wikilinks]]` with autocomplete and back/forward history (v6), a dynamic outline,
  library with folders and a global search
  ([features](https://ia.net/writer/support/basics/features)). Sync is via iCloud/Dropbox/Google
  Drive/OneDrive, no proprietary cloud.
- Export: DOCX, PDF, HTML with custom templates; publishes directly to Ghost, Medium, WordPress,
  Micropub, Micro.blog ([features](https://ia.net/writer/support/basics/features)).
- Review/collaboration: nothing multi-user; Authorship is single-document provenance.
- Reading aids: Preview renders a styled read view ([ia.net/writer](https://ia.net/writer)).
- Theming: the iA Mono/Duo/Quattro typefaces, light/dark; no CSS for the editor, templates for
  export only.
- Price: Mac $49.99, Windows $29.99, iOS $49.99, each one-time; Android offers subscription or
  one-time ([pricing](https://ia.net/writer/pricing)).

## Obsidian

- What it is: closed-source freeware on Electron (43.1.1 as of 1.13.0) for macOS/Windows/Linux plus
  iOS/Android; local-first, plain Markdown files in a vault ([obsidian.md](https://obsidian.md/),
  [changelog](https://obsidian.md/changelog)).
- Editing: Live Preview hides syntax until the caret enters it; Source mode shows raw text; ⌘E
  toggles ([Live preview](https://help.obsidian.md/Live+preview+update)). Callouts, footnotes,
  embeds, MathJax (4.1.3 as of 1.14.1, Sept 8, 2026), Mermaid ([Obsidian Flavored
  Markdown](https://obsidian.md/help/obsidian-flavored-markdown), [advanced
  syntax](https://help.obsidian.md/advanced-syntax)). Canvas is an infinite whiteboard saved as JSON
  Canvas ([canvas](https://obsidian.md/canvas)). Bases (2026) adds table/card/list/Kanban/map views
  over note properties ([bases](https://obsidian.md/help/bases)).
- Navigation: folders, backlinks, graph view, tags, properties, a redesigned searchable Settings
  panel in 1.13 ([changelog](https://obsidian.md/changelog)).
- Export: native PDF only; Word/HTML/EPUB need community plugins such as the Pandoc plugin
  ([obsidian-pandoc](https://github.com/frogkind/obsidian-pandoc)). Import from Notion, Evernote,
  Apple Notes, Bear, Roam, Logseq and more ([import](https://obsidian.md/help/import)). Publish
  hosts a vault as a site for $8/month annual ([publish](https://obsidian.md/publish)).
- Review/collaboration: no first-party comments or track changes; the CriticMarkup-based Commentator
  plugin and "Document Comments" fill the gap ([Commentator
  thread](https://forum.obsidian.md/t/beta-plugin-commentator-suggestions-and-comments-with-criticmarkup/66013)).
  Sync ($4/month annual Standard, $8 Plus) gives shared vaults and 1- or 12-month version history
  ([sync](https://obsidian.md/sync)).
- Theming: two built-in schemes, hundreds of community themes, CSS snippets, separate
  interface/text/monospace font settings ([appearance](https://obsidian.md/help/appearance)). The
  directory lists 7,497 plugins and 732 themes
  ([community.obsidian.md](https://community.obsidian.md/)).
- Price: free for personal and commercial use; optional $50/user/year Commercial license and $25
  Catalyst ([pricing](https://obsidian.md/pricing)). Not open source.

## Bear (and Panda / Lettera)

- What it is: native Swift app for Mac, iPhone, iPad, Watch, Vision; notes live in a local SQLite
  library with iCloud sync ([App
  Store](https://apps.apple.com/us/app/bear-markdown-notes/id1016366447)). Panda is the code name
  for Bear 2's editor engine, first previewed in 2021 ([Checking in on
  Panda](https://blog.bear.app/2021/06/checking-in-on-panda-the-next-editor-for-bear/)). Lettera, a
  Mac-only public beta from the same team, puts the Panda editor on ordinary `.md` files without
  importing into the library
  ([MacStories](https://www.macstories.net/news/the-bear-team-releases-public-beta-of-lettera-a-new-mac-markdown-editor/));
  this is the product Folio should watch, since it is a Typora-shaped editor from a team with a
  polished engine.
- Editing: hidden-syntax Markdown, multi-line tables, footnotes, folding of sections and lists
  (H1–H6), rich link previews, a stats bar with read time, Bear Sans ([Panda
  post](https://blog.bear.app/2021/06/checking-in-on-panda-the-next-editor-for-bear/)); math,
  Mermaid, wiki links and backlinks ([bear.app](https://bear.app)). Typewriter mode remains a
  long-running forum request, not a shipped feature ([community
  thread](https://community.bear.app/t/typewriter-mode/134)).
- Navigation: no folders; nested `#tags/like/this` with 250+ tag icons, pinning ([nested
  tags](https://bear.app/faq/nested-tags/)).
- Export: TXT, Markdown, TextBundle, RTF, PDF, JPG, HTML, DOCX, ePub; PDF/HTML/DOCX/JPG are Pro
  ([Pro features](https://bear.app/faq/features-and-price-of-bear-pro/)). No blog publishing.
- Review/collaboration: none; shared notes are an open feature request
  ([thread](https://community.bear.app/t/collaborate-and-share-notes/18585)). No per-note version
  history, only whole-library backup ([revision history
  request](https://community.bear.app/t/note-revision-history/12381),
  [backup](https://bear.app/faq/backup-restore/)).
- Reading aids: Read-Only Mode locks a note "for reviewing and reflecting" ([read-only
  mode](https://bear.app/faq/how-to-use-read-only-mode/)).
- Theming: 3 themes free, 28+ with Pro; themes are XML files inside the bundle, no supported custom
  themes ([custom themes exchange](https://community.bear.app/t/custom-themes-exchange/11364),
  secondary).
- Price: Pro $2.99/month or $29.99/year; v2.9.4 shipped Sept 2026 ([App
  Store](https://apps.apple.com/us/app/bear-markdown-notes/id1016366447)).

## Ulysses

- What it is: native, closed-source app for Mac, iPad, iPhone only
  ([ulysses.app](https://ulysses.app)).
- Editing: "Markdown XL" plain-text markup with inline rendering of emphasis, images, footnotes.
  Built-in comments and review marks exist in the syntax itself: `++inline comment++`, `%% comment
  block`, `||deleted text||`, and `{annotation}` notes attached to a phrase, all collected in an
  Annotations view ([Comments, Notes,
  Annotations](https://help.ulysses.app/en_US/dive-into-editing/comments-notes-annotations)).
  Grammar and Style Check via LanguageTool Plus, 20+ languages, online for the advanced check
  ([grammar and style check](https://help.ulysses.app/en_US/the-dashboard/grammar-and-style-check)).
  Internal links to any heading across sheets with history navigation since v35
  ([9to5Mac](https://9to5mac.com/2024/06/04/ulysses-writing-app-mac-ipad-and-iphone-internal-linking/)).
  Writing goals with deadlines.
- Navigation: Library of Groups (folders), Sheets (titleless documents) and Filters (saved
  searches); external folders supported ([the library](https://help.ulysses.app/en_US/the-library)).
- Export: PDF, DOCX, ePub, HTML, Markdown ([App
  Store](https://apps.apple.com/us/app/ulysses/id1225571038)). Publishes and updates posts on
  WordPress, Ghost and Micro.blog; Medium is publish-once-as-draft and Medium no longer issues new
  API tokens ([publishing](https://help.ulysses.app/publishing)). Substack/Basecamp are copy/export
  only since v39
  ([Cassinelli](https://matthewcassinelli.com/ulysses-actions-shortcuts-best-app-blogging-substack/),
  secondary).
- Review/collaboration: single-user only. Per-sheet version browsing via the macOS Versions UI
  ([FinerTech](https://www.finertech.com/2015/08/05/ulysses-for-mac-has-a-time-machine-view-for-your-document-history/),
  secondary).
- Theming: styles are real CSS for HTML/ePub and a CSS-like "ULSS" for PDF/DOCX; duplicate a
  built-in style and edit it in any editor ([CSS
  reference](https://ulysses.app/styles/css-reference/)).
- Price: $5.99/month or $39.99/year, all Apple platforms, Family Sharing; v40.4 Aug 2026
  ([pricing](https://ulysses.app/pricing/), [App
  Store](https://apps.apple.com/us/app/ulysses/id1225571038)).

## Zettlr

- What it is: GPLv3 Electron app for Windows/macOS/Linux aimed at academic writing; no cloud, no
  telemetry ([zettlr.com](https://zettlr.com), [repo](https://github.com/Zettlr/Zettlr)).
- Editing: inline LaTeX math and Mermaid, snippets with tabstops, `%% comments %%` excluded from
  word counts, distraction-free and typewriter modes ([zettlr.com](https://zettlr.com)).
  Zotero/JabRef/Juris-M citations with 9,000+ CSL styles.
- Navigation: file tree, Zettelkasten IDs, wiki links plus implicit links through shared `#tags`, a
  Related Files sidebar ranked by shared links/tags, graph view, outline, full-text search ([zkn
  method](https://docs.zettlr.com/en/pkms/zkn-method/), [related
  files](https://docs.zettlr.com/en/sidebar/related-files/)).
- Export: the embedded Pandoc binary driven by editable YAML profiles per format, so PDF via XeLaTeX
  or an HTML route, HTML, Textbundle, and anything Pandoc supports through custom profiles and
  templates ([export](https://docs.zettlr.com/en/export/), [defaults
  files](https://docs.zettlr.com/en/export/defaults-files.html), [custom
  templates](https://docs.zettlr.com/en/export/custom-templates.html)).
- Review/collaboration: none.
- Theming: built-in themes with light/dark pairs; full custom CSS with documented geometry/theme
  split and a `.dark` body class ([custom CSS](https://docs.zettlr.com/en/guides/custom-css/)).
- Performance: 4.6.0 (June 13, 2026) rewrote full-text search, claiming 50–100% faster ([release
  post](https://zettlr.com/post/zettlr-460-released)).
- Price: free, donations only ([zettlr.com](https://zettlr.com)).

## MarkText

- What it is: MIT-licensed Electron + Vue 3 editor for Linux/macOS/Windows
  ([repo](https://github.com/marktext/marktext),
  [package.json](https://raw.githubusercontent.com/marktext/marktext/master/package.json),
  [LICENSE](https://github.com/marktext/marktext/blob/master/LICENSE)). Development resumed in 2026
  after a long lull; v0.19.1 shipped June 2026 with v0.20.0 in RC
  ([releases](https://github.com/marktext/marktext/releases)).
- Editing: real-time WYSIWYG, CommonMark + GFM + some Pandoc extensions, KaTeX, Mermaid,
  flowchart.js, Prism highlighting, source code mode, typewriter and focus modes, paste images from
  clipboard ([README](https://github.com/marktext/marktext)).
- Export: HTML and PDF only ([README](https://github.com/marktext/marktext)).
- Review/collaboration: none.
- Theming: six built-in themes (Cadmium Light, Dark, Graphite, Material Dark, One Dark, Ulysses)
  ([README](https://github.com/marktext/marktext)).
- Price: free, MIT, Open Collective funded
  ([opencollective.com/marktext](https://opencollective.com/marktext)). MarkText is the most direct
  free open-source analogue to Folio's editing surface; its differentiators are breadth of syntax,
  not workflow.

## Inkdrop

- What it is: Electron note app for developers on macOS/Windows/Linux/iOS/Android with a
  CodeMirror-based editor that styles Markdown in place while keeping the source visible
  ([features](https://www.inkdrop.app/features), [forum on the
  editor](https://forum.inkdrop.app/t/how-does-inkdrop-implement-the-wysiwyg-markdown-editor/2779)).
  Core app is closed; plugins and themes are public.
- Editing: slash-command menu, floating selection toolbar, code blocks with autocomplete and
  filenames, Mermaid with pan/zoom, KaTeX, emoji autocomplete, link-title fetching on paste. AI: an
  inline assistant, Next Edit Suggestions, and an MCP server so agents can read notes
  ([features](https://www.inkdrop.app/features)).
- Navigation: nested notebooks with icons, tags, per-note status (active/on hold/completed/dropped),
  "Telescope" fuzzy finder, full-text and semantic search
  ([features](https://www.inkdrop.app/features)).
- Export: Markdown, HTML, PDF through official plugin repos ([org
  repos](https://github.com/orgs/inkdropapp/repositories)); no Pandoc
  ([forum](https://forum.inkdrop.app/t/how-to-send-and-inkdrop-md-document-to-pandoc/2461)).
- Theming: community UI themes plus a user `styles.css`; plugin API in TypeScript, `init.js`, local
  HTTP server ([features](https://www.inkdrop.app/features)).
- Price: $9.98/month or $99.80/year, one plan, cloud sync included, 30-day trial
  ([pricing](https://www.inkdrop.app/pricing/)); doubled from $4.99 in Feb 2024 ([price
  change](https://forum.inkdrop.app/t/inkdrop-price-change/4366)).

## Logseq

- What it is: AGPL-3.0 outliner in ClojureScript on Electron (desktop), iOS app, and web; the
  classic version stores Markdown or Org files, the "DB" version moves to a database with a Markdown
  round-trip ([repo](https://github.com/logseq/logseq), [DB
  changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013)).
- Editing: block outliner, daily journals, PDF annotation, templates auto-applied to tagged pages,
  bulk block operations, vector search in the DB version ([DB
  changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013)).
- Navigation: graph view (rebuilt May 2026), linked references, tags, CLI queries ([May 16, 2026
  update](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020)).
- Export: Markdown, a static HTML "public graph" export, PDF via print (secondary:
  [randomgeekery](https://randomgeekery.org/post/2022/03/logseqs-export-formats/); docs.logseq.com
  could not be fetched).
- Review/collaboration: real-time collaboration is invite-only alpha; no comments or track changes
  ([DB changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013)).
- Theming: marketplace of plugins and themes ([marketplace](https://logseq.github.io/marketplace/)).
- Price: free; paid tiers are Open Collective sponsorships ($5 Backer, $15 Sponsor with beta access)
  rather than a SKU ([opencollective.com/logseq](https://opencollective.com/logseq)).

## Notion

- What it is: cloud-hosted SaaS; web app, Electron desktop for macOS/Windows/Linux, iOS/Android
  ([3perf](https://3perf.com/blog/notion/), secondary for the Electron claim).
- Editing: block editor with databases (subtasks, dependencies, charts), forms, Sites
  ([pricing](https://www.notion.com/pricing)).
- Export: PDF, HTML, Markdown + CSV; "include subpages" is Business/Enterprise; workspace export is
  Enterprise beta ([export your content](https://www.notion.com/help/export-your-content)).
- Review/collaboration: real-time multiplayer with live cursors on all plans; permission levels Full
  access / Can edit / Can comment / Can view; page history 7 days Free, 30 days Plus ([sharing and
  permissions](https://www.notion.com/help/sharing-and-permissions),
  [pricing](https://www.notion.com/pricing)). Agent Edit Suggestions (Aug 28, 2026) let an agent
  propose edits for line-by-line approval instead of applying them
  ([releases](https://www.notion.com/releases)); this is Notion arriving at Folio's review-mode idea
  from the other side.
- Theming: light/dark and a High Contrast mode (July 30, 2026)
  ([releases](https://www.notion.com/releases)); no custom CSS.
- Price: Free; Plus $10/member/month annual; Business $20 with Notion Agent and AI; Enterprise
  custom ([pricing](https://www.notion.com/pricing)). Proprietary.

## Paper (Mihhail Lapushkin)

- Coverage is thin: no changelog page; sources are the developer's site and App Store listings plus
  two secondary write-ups. Note a name collision with an unrelated "Paper — Markdown Editor for Mac"
  at [paper-md.com](https://www.paper-md.com/); this section covers the Lapushkin app at
  [paper.pro](https://paper.pro/).
- What it is: native Mac/iPhone/iPad/Vision writing app, file-based, no library ([App
  Store](https://apps.apple.com/us/app/paper-writing-app-notes/id1476984841)).
- Editing: muted-syntax Markdown with a Preview mode; heavily tunable typewriter mode (offset,
  window, scroll speed) and focus mode; an expandable scrollbar that shows headings as chapters;
  font weight and letter-spacing controls; TextExpander ([App
  Store](https://apps.apple.com/us/app/paper-writing-app-notes/id1476984841), [Havn
  review](https://havn.blog/2024/09/29/app-review-paper.html), secondary).
- Export: PDF, HTML, RTF, DOCX, ePub, image, clipboard; publishes to Medium, WordPress, Ghost,
  Micro.blog ([App Store](https://apps.apple.com/us/app/paper-writing-app-notes/id1476984841)).
- Review/collaboration: none found.
- Price: free download; Pro $29.99/month, $99.99/year or $199.99 lifetime as listed in the US store,
  with the developer describing regional prices varying up to 10x ([App
  Store](https://apps.apple.com/us/app/paper-writing-app-notes/id1476984841), [MPU
  thread](https://talk.macpowerusers.com/t/paper-markdown-editor/36568), secondary). Actively
  updated (v114, Sept 2026).

## Marked 2 (and Marked 3)

- What it is: a macOS previewer, not an editor. You edit in anything; Marked re-renders on save
  ([markedapp.com](https://markedapp.com/), [App
  Store](https://apps.apple.com/us/app/marked-2-markdown-preview/id890031187?mt=12)). Marked 3
  shipped May 18, 2026 and moved Marked 2 to maintenance ([Marked 3 is officially
  out](https://brettterpstra.com/2026/05/18/marked-3-is-officially-out/)).
- Editing/analysis: word/character counts, reading time, link validation, CriticMarkup rendering
  "for quickly reviewing changes from collaborators", GFM/MultiMarkdown/Discount, Scrivener and
  Fountain support ([markedapp.com](https://markedapp.com/)).
- Navigation: auto TOC with typeahead section jump, regex search
  ([markedapp.com](https://markedapp.com/)).
- Export: HTML (self-contained), PDF, DOCX; Marked 3 adds DOCX round-trip and "Custom Processors"
  ([Marked 3 post](https://brettterpstra.com/2026/05/18/marked-3-is-officially-out/)).
- Theming: nine built-in styles, unlimited custom CSS, a public gallery of 40+ community styles
  including a Teleprompter autoscroll style; Marked 3 adds a "Style Stealer" that copies a live
  site's CSS so the preview matches the published look ([styles](https://marked2app.com/styles/),
  [Marked 3 post](https://brettterpstra.com/2026/05/18/marked-3-is-officially-out/)).
- Price: Marked 2 $13.99 one-time ([App
  Store](https://apps.apple.com/us/app/marked-2-markdown-preview/id890031187?mt=12)); Marked 3
  $2.99/month or $29.99/year early-bird with a permanent-unlock option
  ([markedapp.com](https://markedapp.com/)).

## Byword

- Coverage is thin and dated: the site is live but frozen ("© 2023"), the blog and features pages
  404, and the Mac app was last updated Oct 16, 2023 (v2.9.6, Sonoma compatibility), the iOS app
  April 2020 ([bywordapp.com](https://www.bywordapp.com/), [Mac App
  Store](https://apps.apple.com/us/app/byword/id420212497?mt=12)). Treat as dormant, not
  discontinued.
- What it is: native Mac/iOS plain-text Markdown editor with syntax highlighting, live word count,
  in-app preview, footnotes and tables; documents sync through iCloud/Dropbox with no library
  ([bywordapp.com](https://www.bywordapp.com/)).
- Export: HTML, PDF, RTF; publishing to Medium, WordPress, Blogger, Tumblr, Evernote was a $4.99
  in-app purchase
  ([MacStories](https://www.macstories.net/reviews/byword-2-0-gets-publishing-services-improved-sync-and-more/),
  secondary).
- Price: $10.99 one-time on the Mac App Store ([App
  Store](https://apps.apple.com/us/app/byword/id420212497?mt=12)).

## Hemingway Editor

- What it is: a readability checker, free on the web and $19.99 one-time as a Mac/Windows desktop
  app; a "Plus" AI tier exists with a 2-week trial whose price could not be confirmed on an official
  page ([desktop](https://hemingwayapp.com/desktop), [hemingwayapp.com](https://hemingwayapp.com)).
- Reading aids: a grade-level score for the whole text; per-sentence highlights: red for very hard
  sentences, yellow for hard, blue for adverbs/passive voice/qualifiers, purple for words with a
  simpler alternative, green for grammar (Plus only); each category can be toggled ([readability
  docs](https://hemingwayapp.com/help/docs/readability), [help](https://hemingwayapp.com/help)).
  Plus targets grade 9 by default with "Accessible" and "Technical" presets ([readability
  docs](https://hemingwayapp.com/help/docs/readability)).
- Everything else: no organization, no export beyond copy/HTML, no theming. It matters here as the
  reference design for judging prose quality at a glance, which is exactly what a reviewer of agent
  output needs.

## Draft (draftin.com)

- Status: defunct. `draftin.com` no longer resolves (NS records only, no A record, verified
  2026-09-11). A same-named `draft.co` shows "Draft is no longer operational as of August 23, 2026"
  with subscriptions cancelled May 25, 2026 ([draft.co](https://draft.co/)); whether that business
  is the direct successor of Nathan Kontny's tool is not confirmed by any primary source.
- What it was: a web Markdown editor that did "for writers what version control does for
  developers": each collaborator edited their own copy, and the author accepted or rejected each
  change individually; inline comments; clean named saves rather than autosave noise; publishing to
  WordPress, Blogger, Tumblr, Twitter, LinkedIn, MailChimp and a REST API; Dropbox/Evernote/Drive
  sync ([Torque, 2013](https://torquemag.io/2013/03/draft-vc/), [TechCrunch,
  2013](https://techcrunch.com/2013/06/11/in-writing-platform-push-draft-lets-you-collaborate-to-publish-anywhere/),
  both secondary). Free, with paid human editing ([Y
  Combinator](https://www.ycombinator.com/companies/draft)).
- Why it still matters: the accept/reject-per-change model over Markdown is the interaction Folio's
  review mode reproduces with an agent as the collaborator.

## plannotator

- What it is: an MIT/Apache-2.0 local web UI for reviewing agent output, started December 2025, 8.6k
  stars and active as of Sept 10, 2026 ([plannotator.ai](https://plannotator.ai/),
  [repo](https://github.com/backnotprop/plannotator), [Show
  HN](https://news.ycombinator.com/item?id=48495970)). It began as a Claude Code plan-mode hook:
  instead of approving a plan in the terminal, the plan opens in the browser to be marked up.
- How it opens: automatically at an agent's plan-approval step; `/plannotator-annotate <file|url>`,
  `/plannotator-last`, `/plannotator-review` for uncommitted diffs or PR URLs; also a VS Code
  webview and a hosted demo ([repo](https://github.com/backnotprop/plannotator)).
- Annotation actions: inline comments, deletion redlines, replacement text, labels/tags, line-level
  code suggestions in diff view, approve/deny; denial returns structured feedback to the agent's
  next turn, approval of a code review sends "LGTM"
  ([repo](https://github.com/backnotprop/plannotator)).
- Feedback path: a local server injects annotations into the agent session, no copy-paste. Sharing
  is end-to-end encrypted with the key in the URL fragment
  ([repo](https://github.com/backnotprop/plannotator)).
- Integrations: Claude Code, Codex, Copilot CLI, Gemini CLI, OpenCode, Kiro, Droid, Amp, Pi; Git,
  GitButler, Jujutsu, Perforce, GitHub, GitLab ([plannotator.ai](https://plannotator.ai/)).
- Price: free and open source; a hosted "Workspaces" team layer is announced but unpriced
  ([plannotator.ai](https://plannotator.ai/)).
- Versus Folio: plannotator is a review surface summoned at checkpoints, not an editor; it has no
  live file watching, no reading panel, no persistence across rewrites. Its strengths are agent
  breadth and the zero-copy feedback path.

## herdr-annotate

- What it is: an MIT plugin (created Aug 9, 2026, 424 stars) by the plannotator org for Herdr, a
  terminal multiplexer for running several coding agents; it wraps a "Plannotator TUI" that also
  runs standalone ([repo](https://github.com/plannotator/herdr-annotate), [herdr.dev
  docs](https://herdr.dev/docs/)). Coverage is limited to the README and one blog mention
  ([Copes](https://flaviocopes.com/herdr/), secondary).
- Actions: `Ctrl+B A` comment on selected terminal or document text, `Ctrl+B Shift+A` copy all
  annotations as Markdown, `Ctrl+B M` manage/archive, `Ctrl+B O` open a file tree or the agent's
  recent replies for review; Send turns the annotated review into the agent's next message. A "lite"
  variant is a select-and-comment popover with Windows preview support
  ([repo](https://github.com/plannotator/herdr-annotate)).
- Versus Folio: same feedback grammar (comment → agent's next message) delivered in the terminal,
  without rendering. Useful signal that the annotation vocabulary Folio uses
  (comment/replace/delete/approve) is becoming the norm.

## Newcomers, 2025–2026

- Nimbalyst ([site](https://nimbalyst.com/blog/the-complete-guide-to-markdown-editors/),
  [repo](https://github.com/Nimbalyst/nimbalyst)): MIT, Electron + React + Lexical/Monaco, created
  Oct 2025, 1.7k stars, active. A "visual workspace for Claude Code, Codex and OpenCode": run
  several agents in parallel and step through their edits as red/green inline diffs in a rendered
  document, accepting or rejecting each; visual Mermaid/Excalidraw/CSV editing; desktop plus mobile
  companions. The closest feature-level competitor to Folio's diff review, framed as a multi-agent
  cockpit rather than a document editor.
- Ritemark ([site](https://ritemark.app/en/), [comparison
  page](https://ritemark.app/en/good-to-know/comparisons/best-markdown-editor-for-ai/)): MIT, native
  macOS/Windows editor with a built-in terminal so agents edit local files directly; local-first,
  persistent agent conversations; v1.9 Aug 2026. No annotation or structured review UI found.
- Markdown Studio ([Product Hunt](https://www.producthunt.com/products/markdown-studio)): free
  browser editor launched Dec 2025 for preparing prompts and content for LLMs: per-model token
  counters, GitHub gist/repo sync, templating. Writing for models rather than reviewing them; no
  review features.
- Toril ([repo](https://github.com/kovirlabs/toril)): Apache-2.0, Tauri 2 + Rust + Milkdown, inline
  rendering, Obsidian-vault compatible, no cloud/plugins/telemetry; created May 2026, 6 stars. Same
  technical lane as Folio, no traction yet; a watch item only.

## Synthesis

### Feature matrix

Legend: Y yes, N no, P partial or plugin-only. "Review" means comments, suggestions or
accept/reject marks that live with the document. Sources are the product sections above.

| Product | WYSIWYG | Source mode | Outline/TOC | Links/backlinks | Tags | Cross-file search | Version history | Real-time collab | Review/comments | Export | Custom CSS/themes | Focus/typewriter | Plugins | AI writing | Local plain files | Price |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Folio | Y | Y | Y (reading panel) | P (⌘-click, back/forward) | N | N | P (reviewed files, 20 revisions) | N | Y (review mode, feedback file) | HTML, PDF | P (5 themes, no user CSS) | Y | N | N | Y | Free, MIT |
| Typora | Y | Y | Y | P (header anchors) | N | Y (folder) | P (macOS Versions) | N | N | PDF, DOCX, ODT, LaTeX, MediaWiki, EPUB | Y (CSS) | Y | N | N | Y | $14.99 once |
| iA Writer | N (highlighted plain text) | Y | Y | Y (wikilinks) | P (hashtags) | Y | N | N | P (Authorship provenance) | DOCX, PDF, HTML + blogs | P (templates only) | Y | N | N (marks AI text) | Y | $29.99–49.99 per platform |
| Obsidian | Y (Live Preview) | Y | Y | Y (graph) | Y | Y | P (Sync $) | P (Sync shared vaults) | P (plugins) | PDF; others via plugins | Y (CSS, 732 themes) | P (plugins) | Y (7,497) | P (plugins) | Y | Free; Sync $4–8/mo |
| Bear | Y | N | P (folding) | Y | Y (nested) | Y | N | N | N | TXT, MD, RTF, PDF, HTML, DOCX, ePub (Pro) | P (28 themes, no CSS) | N | N | N | N (SQLite library) | $2.99/mo or $29.99/yr |
| Ulysses | P (inline rendering) | Y | Y | Y (internal links) | P (keywords) | Y (filters) | Y (Versions) | N | Y (++comment++, \|\|delete\|\|, {note}) | PDF, DOCX, ePub, HTML + blogs | Y (CSS/ULSS styles) | Y | N | N (LanguageTool check) | P (library, external folders) | $5.99/mo or $39.99/yr |
| Zettlr | P | Y | Y | Y (graph, related files) | Y | Y | N | N | P (%%comments%%) | Pandoc: anything, PDF, HTML, Textbundle | Y (CSS) | Y | N | N | Y | Free, GPLv3 |
| MarkText | Y | Y | N | N | N | N | N | N | N | HTML, PDF | P (6 themes) | Y | N | N | Y | Free, MIT |
| Inkdrop | P (styled source) | Y | N | N | Y | Y | N | N | N | MD, HTML, PDF (plugins) | Y (styles.css) | N | Y | Y (assistant, MCP) | N (synced DB) | $9.98/mo |
| Logseq | P (outliner) | Y | P (blocks) | Y (graph) | Y | Y | P (git) | P (alpha) | N | MD, static HTML, PDF | Y (marketplace) | N | Y | N | P (DB version) | Free, AGPL-3.0 |
| Notion | Y (blocks) | N | P | Y | N | Y | P (7–30 days) | Y | Y (comments, agent edit suggestions) | PDF, HTML, MD+CSV | N | N | N (integrations) | Y (Business+) | N (cloud) | Free–$20/member/mo |
| Paper | P (muted syntax) | Y | P (chapter scrollbar) | N | N | N | N | N | N | PDF, HTML, RTF, DOCX, ePub, image + blogs | P (typography) | Y | N | N | Y | Free + Pro $99.99/yr |
| Marked 3 | preview only | n/a | Y | N | N | N | N | N | P (CriticMarkup render) | HTML, PDF, DOCX | Y (CSS gallery) | n/a | N | N | Y | $2.99/mo or $29.99/yr |
| Hemingway | N | Y | N | N | N | N | N | N | N | HTML/copy | N | N | N | P (Plus) | P (desktop) | Free web; $19.99 desktop |
| plannotator | render only | N | N | N | N | N | N | N | Y (comment, redline, replace, approve) | n/a | N | N | N | N | Y (local) | Free, MIT/Apache |
| Nimbalyst | Y | Y | N | N | N | Y | P (git) | N | Y (accept/reject inline diffs) | n/a | N | N | N | Y (hosts agents) | Y | Free, MIT |

### Gaps Folio should close

Ranked by value to Folio's two audiences (writer, agent reviewer), most valuable first.

1. DOCX export. Every paid editor in the survey ships it: Typora (via Pandoc), iA Writer, Bear Pro,
   Ulysses, Paper, and Marked 3 now round-trips it ([Marked 3
   post](https://brettterpstra.com/2026/05/18/marked-3-is-officially-out/)). Folio's export already
   renders from Markdown rather than the editor, so the pipeline is right; the missing piece is a
   writer. Best implementation to copy: Ulysses, whose export styles share one system across
   HTML/ePub (CSS) and PDF/DOCX (ULSS) so a look defined once applies everywhere ([CSS
   reference](https://ulysses.app/styles/css-reference/)). Options are bundling Pandoc as Zettlr
   does ([defaults files](https://docs.zettlr.com/en/export/defaults-files.html)) or a Rust docx
   crate; the roadmap already flags the licensing question. Effort: L with Pandoc bundling, M with a
   native writer limited to headings/paragraphs/lists/tables/code/images.
2. Quick open across a folder. Typora's sidebar, iA Writer's library search, Obsidian's switcher and
   Inkdrop's Telescope all give a keyboard path to "the other file"; Folio only has tabs and Open
   Recent. The design that fits Folio's no-sidebar stance is iA Writer's: a library that stays out
   of the page, with wikilink autocomplete and global search
   ([features](https://ia.net/writer/support/basics/features)). A ⌘P fuzzy finder over the current
   file's folder plus recents, no persistent tree. Effort: M.
3. Wikilinks and heading links with autocomplete. iA Writer v6 ([version
   history](https://ia.net/writer/support/help/version-history)) and Ulysses v35
   ([9to5Mac](https://9to5mac.com/2024/06/04/ulysses-writing-app-mac-ipad-and-iphone-internal-linking/))
   both added `[[…]]` or heading-target links with back/forward history. Folio has the navigation
   half (⌘-click, Back/Forward); it lacks the authoring half. Agents writing plan sets increasingly
   cross-reference files, so this also serves the review flow. Effort: S for `[[file]]` resolution
   and autocomplete over the folder; M with heading targets.
4. User CSS themes. Typora, Zettlr, Obsidian and Marked all accept a dropped-in stylesheet; Zettlr
   documents its geometry/theme split and a `.dark` body class so themes stay small ([custom
   CSS](https://docs.zettlr.com/en/guides/custom-css/)). Folio has five themes and documented tokens
   would make a sixth a one-file affair. Effort: S.
5. Export styles. Marked's gallery of 40+ CSS styles and the Style Stealer
   ([styles](https://marked2app.com/styles/), [Marked 3
   post](https://brettterpstra.com/2026/05/18/marked-3-is-officially-out/)) show export appearance
   is a product in itself. Folio exports one look; two or three named HTML/PDF styles that reuse the
   theme tokens, plus a custom CSS slot, multiply the value of the existing pipeline. Effort: S–M.
6. Math. Typora (MathJax), MarkText and Obsidian (KaTeX/MathJax) and Bear all render `$…$`; Folio's
   README does not mention it. Milkdown Crepe ships a LaTeX feature, so this is mostly enabling and
   theming it, then covering it in export. Effort: S.
7. Revision history for every file, not only reviewed ones. Typora relies on macOS Versions and has
   nothing on Windows/Linux ([Version Control](https://support.typora.io/Version-Control/)); Ulysses
   browses per-sheet versions; Bear has none. Folio's archive of the last 20 on-disk versions of a
   reviewed file is already better than most; generalizing it to any saved file, with the same diff
   view, is cheap and cross-platform. Effort: S.
8. Section folding. Bear's Panda folds H1–H6 and lists ([Panda
   post](https://blog.bear.app/2021/06/checking-in-on-panda-the-next-editor-for-bear/)); for long
   agent-written specs, collapsing approved sections while reviewing the rest is the reading-side
   use. Effort: M in ProseMirror (decorations plus a fold state keyed by heading).
9. Writing goals. Ulysses's goals with deadlines and iA's counters are table stakes for the writer
   audience; Folio has word count and reading time. A per-document target in the status bar is a
   small addition. Effort: S.
10. Callouts. Obsidian's `> [!note]` callouts ([Obsidian Flavored
    Markdown](https://obsidian.md/help/obsidian-flavored-markdown)) are now common in
    agent-generated docs; rendering them (and the GitHub `> [!NOTE]` variant) as styled blocks
    rather than plain quotes improves reading fidelity. Effort: S.

### Ideas Folio could own

Directions no surveyed product does well, all sitting on top of the review loop and
reading panel Folio already has.

1. Automatic authorship tinting. iA Writer's Authorship shows whose words are whose, but the user
   has to paste AI text through a menu ([Track Authors and
   AI](https://ia.net/writer/how-to/track-authors-and-ai)). Folio already knows, from the watch
   loop, exactly which spans each agent rewrite touched and which the human typed. Persisting a
   provenance map per span (agent-written, human-edited, agent-revised-after-request) and offering
   it as a tint layer, computed locally with no menu, is a strictly better version of the one
   feature the premium writer's editor markets around AI. Effort: M.
2. Verdict-linked revision history. Folio's revision archive and its feedback files are separate
   artefacts. Tying them together turns the archive into a review ledger: revision v4 was produced
   in response to these four change requests; three were addressed (the annotated passage changed),
   one was not (its lines are byte-identical). No agent-review tool in the survey (plannotator,
   herdr-annotate, Nimbalyst) keeps history across rounds; they are single-shot. Effort: M.
3. A review queue. Agents now write several documents per task, and Nimbalyst exists because people
   run several agents at once ([repo](https://github.com/Nimbalyst/nimbalyst)). `folio review a.md
   b.md c.md` (or a folder) could show a queue in the reading panel with each document's reading
   time, live badge, and verdict state, so the reviewer works through changes in reading order
   instead of tab-hunting. Effort: M–L.
4. Local readability signals in the reading panel. Hemingway's grade level and long-sentence
   highlights ([readability docs](https://hemingwayapp.com/help/docs/readability)) are deterministic
   and offline, which keeps them inside Folio's no-AI line. Per-section grade level next to the
   reading time, with an optional hard-sentence highlight, gives a reviewer of agent prose a quick
   "is this readable by the audience it claims" check that none of the review tools offer. Effort:
   S–M.
5. Takeaways as a decision log. `<doc>.decision.md` is one paragraph per document. Structuring it
   lightly (verdict, date, one-line rationale, optional links to the feedback file) and adding a
   "Decisions" view that lists every decision file under the current folder would give Folio
   something no note app has: a reading-side record of what was concluded, not just what was
   written. Effort: S.
6. CriticMarkup as the interchange format. Marked renders CriticMarkup for reviewing collaborators'
   changes ([markedapp.com](https://markedapp.com/)), Obsidian's Commentator plugin uses it
   ([thread](https://forum.obsidian.md/t/beta-plugin-commentator-suggestions-and-comments-with-criticmarkup/66013)),
   and Ulysses's `++`/`||`/`{}` marks are the same idea in a private dialect ([comments and
   annotations](https://help.ulysses.app/en_US/dive-into-editing/comments-notes-annotations)). If
   Folio can export its annotations as CriticMarkup inline (and import it back), a feedback round
   can be opened in any of those tools or in a plain diff, and agents can be told "apply the
   CriticMarkup" with no Folio-specific vocabulary. Effort: S–M.
7. Read-progress in the reading panel. Bear's Read-Only Mode exists for re-reading ([read-only
   mode](https://bear.app/faq/how-to-use-read-only-mode/)), but nothing tracks what you have
   actually read. Since the outline already marks the current section and each section has a reading
   time, a per-section "read" tick persisted with the decision file ("read 6 of 9 sections, 4 min
   remaining") is cheap and unique. Effort: S.
8. A documented feedback protocol. plannotator's strength is that feedback lands in the agent's next
   turn with no copy-paste ([repo](https://github.com/backnotprop/plannotator)). Folio's
   `.feedback.md` is already structured; publishing its format as a stable spec, with an optional
   JSON sidecar and the `/folio` skill as reference client, lets other agent frameworks target it
   and makes the file-is-the-seam model a feature rather than a limitation. Effort: S.

### Deliberately not

- Cloud sync. The paid tier of nearly every closed app is sync: Obsidian Sync at $4–8/month
  ([sync](https://obsidian.md/sync)), Bear Pro's headline feature ([Pro
  features](https://bear.app/faq/features-and-price-of-bear-pro/)), Inkdrop's single $9.98/month
  plan ([pricing](https://www.inkdrop.app/pricing/)). Each of those runs servers and a subscription
  to pay for them. Folio's files already live in whatever folder iCloud, Dropbox or git syncs, which
  is how iA Writer, Zettlr and Typora handle it
  ([features](https://ia.net/writer/support/basics/features), [zettlr.com](https://zettlr.com)), and
  the agent loop depends on the file being on local disk.
- Plugin ecosystem. Obsidian's 7,497 plugins
  ([community.obsidian.md](https://community.obsidian.md/)) are why review, comments, Word export
  and typewriter mode are all "P" in the matrix: they exist, but as third-party code with its own
  bugs and abandonment. Inkdrop and Logseq accepted the same trade. Folio's review loop must be
  first-party to stay coherent, and a plugin API on top of Milkdown/Tauri would be a permanent
  compatibility surface for a one-person project.
- Built-in AI writing. Notion folded AI into the $20/member Business plan
  ([pricing](https://www.notion.com/pricing)), Inkdrop added an inline assistant and MCP server
  ([features](https://www.inkdrop.app/features)), Hemingway sells a Plus tier, and Ritemark embeds a
  terminal for agents ([ritemark.app](https://ritemark.app/en/)). All of them need API keys, network
  access, and a model choice UI. Folio's position is the other side of that transaction: the agent
  writes elsewhere, Folio is where a person reads and decides. iA Writer shows a no-AI editor can
  still be AI-aware (Authorship) without generating text, and that is the line to hold.
- Real-time multiplayer. Notion has it on every plan
  ([sharing](https://www.notion.com/help/sharing-and-permissions)); Logseq's RTC has been in
  invite-only alpha through 2026 ([DB
  changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013)); Draft's
  version-control-for-writers collaboration died with the product ([draft.co](https://draft.co/)).
  Folio's collaborator is an agent that rewrites the whole file, and the review loop serializes that
  exchange through disk; CRDTs solve a problem Folio's users do not have.
- A database or library instead of files. Bear (SQLite), Ulysses (library), Inkdrop (synced DB) and
  Logseq's DB version gain metadata queries and lose the property that any tool, including an agent,
  can open the document. Obsidian's Bases show you can get database views over plain files without
  abandoning them ([bases](https://obsidian.md/help/bases)); if Folio ever wants structure, that is
  the model, but not now.
- Blog publishing integrations. Ulysses, iA Writer, Byword and Paper all publish to
  Medium/WordPress/Ghost; Ulysses's own help page notes Medium stopped issuing new API tokens
  ([publishing](https://help.ulysses.app/publishing)), and Byword's publishing shipped as a paid
  add-on and then stopped being updated. These are third-party API surfaces that rot. Self-contained
  HTML export, which Folio has, is the durable version.
- Multi-platform native rewrites. Bear, Ulysses, iA Writer and Paper are native Apple apps and have
  no Linux and mostly no Windows builds; iA charges per platform
  ([pricing](https://ia.net/writer/pricing)). Folio's Tauri build already covers the three desktop
  platforms from one codebase at a ~5 MB download; the survey gives no reason to trade that for
  platform-specific code.

