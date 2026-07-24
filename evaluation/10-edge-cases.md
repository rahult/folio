# Edge Cases

## Empty-ish structures

A heading with only formatting:

# ** **

An empty list item:

-
- Not empty
-

An empty blockquote:

>

> Not empty

## Formatting spanning structures

**Bold that starts in one paragraph

and ends in another?** — CommonMark: this is NOT bold across paragraphs.

*Italic across a
soft line break* — this IS italic.

## Ambiguous markers

A line that is just: **

A line that is just: *

A line that is just: __

2 * 3 * 4 = 24 — asterisks as math, not emphasis.

## Deep nesting

> > > > > > Six levels of quote nesting.

- - - - - - Six levels of list nesting.

## Very long paragraph

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.

## Many consecutive empty lines



(There were blank lines above — collapsible in rendering?)



And more above.

## Tab characters

	Tab-indented line (code block in CommonMark).

Text	with	inline	tabs.

## Trailing whitespace-only line

A paragraph.
   
Followed by a line that held only spaces.

## Windows line endings

This file uses LF, but try saving a copy with CRLF (`unix2dos`) and confirm the app normalizes it (see `normalizeMarkdown` in src/markdown.ts) and does not show phantom diffs.

## No trailing newline

The final line of this file has no trailing newline character — check open/save round-trips do not surprise the user.
