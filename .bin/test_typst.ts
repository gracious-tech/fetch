
// Convert test_web_psa.usx to a full Typst document, written to stdout

import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {JSDOM} from 'jsdom'

import {usx_to_json_typst, default_typst_definitions}
    from '../converters/usx-to-json/src/typst.js'


// Resolve the USX fixture relative to the project root (caller sets CWD)
const usx = readFileSync(join(process.cwd(), 'converters', 'test_web_psa.usx'),
    {encoding: 'utf8'})

// Run the converter with a JSDOM-provided DOMParser (no global one in Node)
const DOMParser = new JSDOM().window.DOMParser
const result = usx_to_json_typst(usx, DOMParser)

// Concatenate the 3-tuples per verse → per chapter → whole book
const body = result.contents
    .map(chapter => chapter.map(verse => verse.join('')).join(''))
    .join('')

// Prepend default consumer definitions so the output compiles standalone
process.stdout.write(default_typst_definitions + '\n' + body)
