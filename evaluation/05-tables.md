# Tables (GFM)

## Basic table

| Name    | Role      | Active |
| ------- | --------- | ------ |
| Ada     | Engineer  | Yes    |
| Grace   | Admiral   | No     |
| Alan    | Scientist | Yes    |

## Column alignment

| Left-aligned | Centered | Right-aligned |
| :----------- | :------: | ------------: |
| a            |    b     |             c |
| longer text  |   mid    |         12.50 |
| x            |    y     |           999 |

## Inline formatting inside cells

| Feature        | Syntax              | Notes                |
| -------------- | ------------------- | -------------------- |
| Bold           | `**text**`          | **Renders bold**     |
| Italic         | `*text*`            | *Renders italic*     |
| Code           | `` `code` ``        | `inline in a cell`   |
| Link           | `[t](https://e.com)`| [Example](https://example.com) |
| Strikethrough  | `~~gone~~`          | ~~struck~~           |

## Ragged rows

Rows with missing or extra cells:

| One | Two | Three |
| --- | --- | ----- |
| a   | b   | c     |
| a   | b   |
| a   | b   | c     | d   |

## Escaped pipes

| Expression | Meaning          |
| ---------- | ---------------- |
| `a \| b`   | Pipe inside code |
| a \| b     | Escaped pipe     |

## Wide table

| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 | Col 7 | Col 8 |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| 1     | 2     | 3     | 4     | 5     | 6     | 7     | 8     |
| alpha | beta  | gamma | delta | eps   | zeta  | eta   | theta |

## Empty header cells

|     | A   |     |
| --- | --- | --- |
| x   | y   | z   |
