# USX to HTML

This module converts USX1+ to HTML, organised by verse in a JSON structure.

## A bit of context
USX is an XML format for Scripture that principally organises text into paragraphs. Verse markers are inserted into paragraphs to designate where a verse starts or ends, but they do not affect the structure of the document.

However, most applications will want to get specific ranges of verses. If they clip a section of markup from where a verse starts to where one ends, they will almost certainly obtain invalid markup with a missing opening and/or closing tag for a paragraph.

## Solution
This module returns a JSON structure that organises the text by verse, but the contents of each verse is HTML. For each verse, there is also optional "opening" and "closing" data, that can be prepended or appended to the verse contents to ensure the output is always valid.

```json
{
    "contents": [
        [],  // Chapter 0 has 0 verses
        [  // Chapter 1
            ["", "", ""],  // Verse 0
            ["", "<p>First verse starts a new paragraph but doesn't end it. ", "</p>"],
            ["<p>", "Second verse occurs within an existing paragraph and ends it.</p>", ""]
        ]
    ]
}
```

You can see above that each verse will be valid if you combine their `opening` + `contents` + `closing` elements. If you are combining a range of verses, then you simply must prepend the `opening` tags of the first verse and append the `closing` tags of the last verse, ignoring opening/closing tags for the verses in between. Following these simple rules will ensure the output is always valid.

## Examples
These examples show how obtaining a passage can be done manually. Most users will prefer to use `@gracious.tech/fetch-client` which provides methods to easily do this for you.

```js
// Convert a USX document for the book of Luke
const luke = usx_to_html(luke_in_usx)

// Get a single verse
const chapter1verse5 = luke.contents[1][5].join('')

// Get a chapter
const chapter2_start = luke.contents[2][1][0]
const chapter2_contents = luke.contents[2].map(v => v[1]).join('')
const chapter2_end = luke.contents[2].at(-1)[2]
const chapter2 = chapter2_start + chapter2_contents + chapter2_end

// Get a custom range
const ch3_v5to9_start = luke.contents[3][5][0]
const ch3_v5to9_contents = luke.contents[3].slice(5, 9+1).map(v => v[1]).join('')
const ch3_v5to9_end = luke.contents[3][9][2]
const ch3_v5to9 = ch3_v5to9_start + ch3_v5to9_contents + ch3_v5to9_end

// Get whole book
// NOTE Starting and closing tags not needed since nothing being clipped
const all_verses = luke.contents.flat().map(v => v[1]).join('')
```
