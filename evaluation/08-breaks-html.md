# Breaks, Rules, and Raw HTML

## Horizontal rules

Three styles of thematic break:

---

***

___

Longer rule:

- - - -

## Soft vs hard line breaks

This line ends with a soft break
and continues on the next source line (rendered as one flowing paragraph).

This line ends with two trailing spaces  
so this sentence starts on a new rendered line (hard break).

This line ends with a backslash\
which is also a hard break in CommonMark.

## Raw HTML blocks

<div style="border: 1px dashed #999; padding: 8px;">
  A raw HTML block. Whether this renders, is escaped, or is stripped
  shows how the engine treats inline HTML.
</div>

<p>A raw HTML paragraph with <strong>raw strong</strong> markup.</p>

## Inline HTML

A paragraph with an inline <em>HTML em tag</em> and a <code>raw code tag</code> inside it.

## Comments

<!-- This HTML comment should not appear in the rendered output. -->

Text after the comment.
