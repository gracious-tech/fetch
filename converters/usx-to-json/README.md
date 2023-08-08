# USX to JSON

This module converts USX1+ to JSON, with verse contents in either HTML or plain text.

## A bit of context
USX is an XML format for Scripture that principally organises text into paragraphs. Verse markers are inserted into paragraphs to designate where a verse starts or ends, but they do not affect the structure of the document.

However, most applications will want to get specific ranges of verses. If they clip a section of markup from where a verse starts to where one ends, they will almost certainly obtain invalid markup with a missing opening and/or closing tag for a paragraph.


## Plain text format
When used to generate plain text, this module will return an array of strings for each verse. Line breaks are represented by a single newline character, while paragraphs are designated by two newline characters. Headings and footnotes are objects within the array of a verse's contents, and can easily be filtered out if not desired.

```json
{
    "contents": [
        [],  // Chapter 0 has 0 verses
        [  // Chapter 1
            [],  // Verse 0
            ["First verse.\\nPoetry has single line break.\\n\\nParagraph breaks have two newlines."],
            ["Second verse with footnote", {"type": "note", "contents": "A note."}, " in middle."],
            [{"type": "heading", "contents": "Verse three", "level": 2}, "Verse three starts with a heading"]
        ]
    ]
}
```


### Plain text examples
These examples show how obtaining a passage can be done manually. Most users will prefer to use `@gracious.tech/fetch-client` which provides methods to easily do this for you.

```js
// Convert a USX document for the book of Luke
const luke = usx_to_json_txt(luke_in_usx)

// Get a single verse
const chapter1verse5 = luke.contents[1][5]

// Strip out headings/footnotes so have a single string
const no_headings_or_footnotes = chapter1verse5.filter(part => typeof part === 'string').join('')

// Get a chapter
const chapter2 = luke.contents[2].flat()

// Get a custom range
const chapter3_v5to9 = luke.contents[3].slice(5, 9+1).flat()

// Get whole book
const all_verses = luke.contents.flat(2)

```


## HTML format
When used to generate HTML, this module will return a tuple of strings for each verse `[open, contents, close]`, with optional "opening" and "closing" data that can be prepended or appended to the verse contents to ensure the output is always valid. Such data is only needed to repair the markup if a verse started or ended mid-paragraph. If you are fetching the entire book, all the opening/closing repair data can be discarded.

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

### HTML examples
These examples show how obtaining a passage can be done manually. Most users will prefer to use `@gracious.tech/fetch-client` which provides methods to easily do this for you.

```js
// Convert a USX document for the book of Luke
const luke = usx_to_json_html(luke_in_usx)

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
