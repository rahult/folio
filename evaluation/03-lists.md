# Lists

## Unordered lists

- Dash bullet
- Second item
- Third item

* Asterisk bullet
* Second item

+ Plus bullet
+ Second item

## Ordered lists

1. First
2. Second
3. Third

Ordered lists may start at any number:

4. Starts at four
5. Fifth
6. Sixth

## Nested lists

- Top level
  - Second level
    - Third level
      - Fourth level
- Back to top

1. Ordered parent
   1. Ordered child
   2. Another child
      - Mixed: unordered grandchild
      - Another grandchild
2. Second parent

## Task lists (GFM)

- [x] Completed task
- [x] Another completed task
- [ ] Pending task
- [ ] Task with **bold** and `code`

## Loose vs tight lists

Tight list (no blank lines between items):

- One
- Two
- Three

Loose list (blank lines between items):

- One

- Two

- Three

## Lists with block content

- Item with a second paragraph.

  This paragraph belongs to the same list item.

- Item with a code block:

  ```js
  const inside = "a list item";
  ```

- Item with a quote:

  > Blockquote inside a list item.

## List interruption

A paragraph followed immediately by:

1. A list starting with 1. — CommonMark: this interrupts the paragraph.

A paragraph followed immediately by:

- A dash list — this does NOT interrupt; it joins the paragraph in strict CommonMark, but many editors split it.
