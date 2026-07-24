# Links and Images

## Inline links

[Simple link](https://example.com)

[Link with title](https://example.com "Example title")

[Link with **bold** text](https://example.com)

Empty link text: []()

## Reference links

[Reference link][ref]

[Collapsed reference][]

[Shortcut reference]

[ref]: https://example.com/reference "Reference title"
[Collapsed reference]: https://example.com/collapsed
[shortcut reference]: https://example.com/shortcut

## Autolinks

<https://example.com/autolink>

<mailto:someone@example.com>

## Bare URLs (GFM autolink extension)

www.example.com and https://gfm.example.com/bare — GFM linkifies bare URLs; check whether the engine does.

## Images

Relative image (tests base-path resolution for local files):

![Local test image](test-image.svg "A local SVG")

Image with alt only:

![Alt text without title](test-image.svg)

Inline image inside text ![tiny](test-image.svg) within a paragraph.

Broken image (missing file — check the fallback rendering):

![This file does not exist](missing-image.png)

Remote image (may be blocked offline):

![Remote placeholder](https://placehold.co/320x120 "Remote image")

## Links with tricky destinations

[URL with parentheses](https://example.com/path_(with_parens))

[Angle-bracket destination](<https://example.com/spaces in path>)
