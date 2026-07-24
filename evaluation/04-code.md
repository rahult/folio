# Code

## Fenced code blocks with languages

```js
// JavaScript — check syntax highlighting
function greet(name) {
  const message = `Hello, ${name}!`;
  return message.toUpperCase();
}
```

```ts
// TypeScript — types highlighted?
interface User {
  id: number;
  name: string;
}

const user: User = { id: 1, name: "Ada" };
```

```rust
// Rust
fn main() {
    let v: Vec<i32> = (1..=10).collect();
    println!("{:?}", v.iter().sum::<i32>());
}
```

```python
# Python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```css
/* CSS */
.editor {
  font-family: "Newsreader Variable", serif;
  color: oklch(0.3 0.01 70);
}
```

```json
{
  "numbers": [1, 2, 3],
  "nested": { "flag": true, "nothing": null }
}
```

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "shell session" && exit 0
```

## Fence without a language

```
Plain preformatted text — no highlighting.
Should use the default code style.
    Indented content preserved.
```

## Tilde fences

~~~ruby
def hello
  puts "tilde fence"
end
~~~

## Code containing fence markers

````
```js
// a fence inside a four-backtick fence
```
````

## Indented code block

    Indented code block (four spaces).
    Second line preserved.

    Blank line inside the block.

## Long lines

```js
const aVeryLongLine = "This line is intentionally long so that you can verify whether the code block wraps its content (pre-wrap) or scrolls horizontally — it should wrap cleanly without any stray horizontal scrollbar appearing below the block.";
```
