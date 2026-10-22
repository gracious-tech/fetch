
import fs from 'node:fs'
import {join} from 'node:path'

import {reverse_usx} from 'reverse-usx'
import {JSDOM} from 'jsdom'

import {pre_convert, pre_reverse, post_reverse} from '../patches/generic.js'
import {convert} from '../parts/usfmtc.js'
import {read_json, list_files} from '../parts/utils.js'
import {translation_source_meta} from '../parts/schemas.js'



const DOM = new JSDOM()
const DOMParser = DOM.window.DOMParser
const XMLSerializer = DOM.window.XMLSerializer


// Dump a single source book at a chosen pipeline stage, to help author quirk patches.
// Stages: 'pre_converted' (after pre_convert patch, pre-usfmtc), 'converted' (post usfmtc),
// 'pre_reverse' (after pre_reverse patch), 'reversed' (after reverse_usx),
// 'post_reverse' (after post_reverse patch on the reversed usx — the text written to all formats)
export async function debug_convert(id:string, book:string, stage:string):Promise<void>{

    // Locate the source book file
    const src_dir = join('sources', 'bibles', id)
    const meta = read_json(join(src_dir, 'meta.json'), translation_source_meta)
    const src_fmt = meta.source.format
    const format_dir = join(src_dir, src_fmt)
    const file = list_files(format_dir)
        .find(f => f.split('.')[0] === book && !f.endsWith('.invalid'))
    if (!file){
        throw new Error(`No source book ${book} for ${id}`)
    }
    const src_text =
        pre_convert(id, book, fs.readFileSync(join(format_dir, file), {encoding: 'utf8'}))
    if (stage === 'pre_converted'){
        process.stdout.write(src_text)
        return
    }

    // Convert to USX3 (mirroring process.ts)
    const source_is_usx3 = src_fmt === 'usx'
        && parseFloat(/<usx version="([\d.]+)">/.exec(src_text)?.[1] ?? '0') >= 3
    const converted = source_is_usx3 ? src_text : await convert(src_text, src_fmt, 'usx', true)
    if (stage === 'converted'){
        process.stdout.write(converted)
        return
    }

    // Apply pre_reverse patch
    const pre_rev = pre_reverse(id, book, converted)
    if (stage === 'pre_reverse'){
        process.stdout.write(pre_rev)
        return
    }

    // Reverse versification
    const reversed = reverse_usx(pre_rev, DOMParser, XMLSerializer, undefined,
        message => {console.error(`[${id}/${book}] ${message}`)})
    if (stage === 'reversed'){
        process.stdout.write(reversed)
        return
    }

    // Apply post_reverse patch (the final text shared by every dist format)
    process.stdout.write(post_reverse(id, book, reversed))
}
