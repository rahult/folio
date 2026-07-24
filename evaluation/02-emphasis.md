# Emphasis and Inline Styles

## Basic styles

*Italic with asterisks* and _italic with underscores_.

**Bold with asterisks** and __bold with underscores__.

***Bold italic*** and ___also bold italic___.

~~Strikethrough~~ (GFM).

## Intraword emphasis

CommonMark does not treat intraword underscores as emphasis:

snake_case_variable and another_one_here

But asterisks intraword **are** emphatic: un**frigging**believable.

## Combined and nested

**Bold with *nested italic* inside.**

*Italic with **nested bold** inside.*

**Bold spanning `inline code` inside it.**

## Inline code

`Simple inline code`

``Code with `backtick` inside (double-backtick fence)``

`  code with leading/trailing spaces  `

## Escapes

\*Not italic\* — escaped asterisks.

\`Not code\` — escaped backticks.

\\Literal backslash.

## Entities and special characters

& < > " should render literally: &amp; &lt; &gt; &quot;

Named entities: &copy; &mdash; &hellip;

Numeric entities: &#169; &#x2014;
