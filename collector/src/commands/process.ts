
import fs from 'node:fs'
import {join} from 'node:path'

import {usx_to_json_html, usx_to_json_txt, usx_to_json_typst} from 'usx-to-json'
import {reverse_usx} from 'reverse-usx'
import {books_ordered} from '@gracious.tech/bible-references'
import {JSDOM} from 'jsdom'

import {pre_convert, pre_reverse, post_reverse} from '../patches/generic.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'
import {concurrent, read_json, write_json, list_files, list_dirs} from '../parts/utils.js'
import {build_native_extra} from '../parts/sections.js'
import {build_extra_overlay} from '../parts/extra_overlay.js'
import {convert} from '../parts/usfmtc.js'

import type {TranslationSourceMeta} from '../parts/types.js'


const DOM = new JSDOM()
const DOMParser = DOM.window.DOMParser
const XMLSerializer = DOM.window.XMLSerializer


export async function update_dist(trans_id?:string){
    // Update distributed HTML/USX files from sources

    // Force recreate distributables if updating a specific translation
    const force = !!trans_id

    // Process translations concurrently (only 4 since waiting on conversion, not network)
    await concurrent(list_dirs(join('sources', 'bibles')).map(id => async () => {

        if (trans_id && id !== trans_id){
            return  // Only updating a single translation
        }

        // Update assets for the translation
        try {
            await _update_dist_single(id, force)
            add_unpublished([`bibles/${id}`])
        } catch (error){
            console.error(`FAILED update dist assets for: ${id}`)
            console.error(error instanceof Error ? error.stack : error)
        }
    }), 4)

    // Fill any missing extra data (names/headings) from sibling translations in the same language
    build_extra_overlay()

    // Update manifest whenever dist files change
    await update_manifest()
}


async function _update_dist_single(id:string, force:boolean){
    // Update distributable files for given translation, converting each book in-memory
    console.info(`Processing ${id}`)

    // Determine paths
    const src_dir = join('sources', 'bibles', id)
    const dist_dir = join('dist', 'bibles', id)

    // Get translation's meta data
    const meta = read_json<TranslationSourceMeta>(join(src_dir, 'meta.json'))
    const src_fmt = meta.source.format  // 'usfm' | 'usx'

    // Confirm have downloaded source already
    const format_dir = join(src_dir, src_fmt)
    if (!fs.existsSync(format_dir)){
        console.warn(`IGNORED ${id} (no source)`)
        return
    }

    // Wipe dist dirs if forcing fresh conversion
    if (force){
        fs.rmSync(dist_dir, {force: true, recursive: true})
    }

    // Ensure dist dirs exist
    for (const format of ['usx', 'usfm', 'html', 'txt', 'typst']){
        fs.mkdirSync(join(dist_dir, format), {recursive: true})
    }

    // Build set of books with valid source files (excludes .invalid-marked and absent books)
    const valid_src_books = new Set(
        list_files(format_dir)
            .filter(f => !f.endsWith('.invalid'))
            .map(f => f.split('.')[0]!))

    // Remove dist files for any book that is no longer valid in source (deleted or marked .invalid)
    // Without this, stale dist files keep being published after a book is dropped or invalidated
    let converted_any = false
    for (const format of ['usx', 'usfm', 'html', 'txt', 'typst']){
        for (const filename of list_files(join(dist_dir, format))){
            const book = filename.split('.')[0]!
            if (!valid_src_books.has(book)){
                console.info(`Removing stale dist file: ${id}/${format}/${filename}`)
                fs.rmSync(join(dist_dir, format, filename))
                converted_any = true
            }
        }
    }

    // Convert each source book through the in-memory pipeline
    for (const file of list_files(format_dir).filter(f => !f.endsWith('.invalid'))){
        const book = file.split('.')[0]!

        // Prefix every converter/diagnostic warning with the translation+book
        const warn = (message:string) => {
            console.warn(`[${id}/${book}] ${message}`)
        }

        const dst_usx = join(dist_dir, 'usx', `${book}.usx`)
        const dst_usfm = join(dist_dir, 'usfm', `${book}.usfm`)
        const dst_html = join(dist_dir, 'html', `${book}.json`)
        const dst_txt = join(dist_dir, 'txt', `${book}.json`)
        const dst_typst = join(dist_dir, 'typst', `${book}.json`)

        // Skip book if all distributable formats already exist (incremental, non-forced runs)
        if (fs.existsSync(dst_usx) && fs.existsSync(dst_usfm)
                && fs.existsSync(dst_html) && fs.existsSync(dst_txt)
                && fs.existsSync(dst_typst)){
            continue
        }
        converted_any = true

        try {
            // Read the unmodified source and apply any quirk fixes that must run before conversion
            // (e.g. inject hil_bib's missing chapter-1 marker). Patching here keeps the stored
            // source pristine while still correcting the dist output.
            const src_text = pre_convert(id, book, fs.readFileSync(
                join(format_dir, file), {encoding: 'utf8'}))

            // Produce USX3: keep source as-is if already USX3, else convert (adding verse end
            // markers). WARN Re-adding esids to already-esid'd USX makes usfmtc emit stray
            // chapter markers, so only convert when the source lacks them (USFM or USX1/2).
            const source_is_usx3 = src_fmt === 'usx'
                && parseFloat(/<usx version="([\d.]+)">/.exec(src_text)?.[1] ?? '0') >= 3
            let usx = source_is_usx3
                ? src_text
                : await convert(src_text, src_fmt, 'usx', true)

            // Apply any quirk fixes that must run before reversing (e.g. LXX Jeremiah truncation)
            usx = pre_reverse(id, book, usx)

            // Normalise versification to the standard 66-book numbering
            let reversed:string
            try {
                reversed = reverse_usx(usx, DOMParser, XMLSerializer, undefined, warn)
            } catch (error){
                // Drop the book rather than publish possibly-wrong numbering (as before)
                warn('Failed to re-verse — dropping book')
                warn(error instanceof Error ? error.message : String(error))
                for (const path of [dst_usx, dst_usfm, dst_html, dst_txt, dst_typst]){
                    fs.rmSync(path, {force: true})
                }
                continue
            }
            const did_reverse = reversed !== usx
            usx = reversed

            // Apply any quirk fixes that must run after reversing on the normalised USX (e.g. LXX
            // Proverbs over-range merge), so every dist format below shares the corrected text
            const post = post_reverse(id, book, usx)
            const did_post_reverse = post !== usx
            usx = post
            fs.writeFileSync(dst_usx, usx)

            // Produce USFM: copy unchanged source USFM, else derive from the patched re-versed USX
            const usfm = src_fmt === 'usfm' && !did_reverse && !did_post_reverse
                ? src_text
                : await convert(usx, 'usx', 'usfm')
            fs.writeFileSync(dst_usfm, usfm)

            // Convert the fully-patched USX (same text written to the usx/usfm formats) to JSON
            write_json(dst_txt, usx_to_json_txt(usx, DOMParser, warn))
            write_json(dst_html, usx_to_json_html(usx, false, DOMParser, warn))
            write_json(dst_typst, usx_to_json_typst(usx, DOMParser, warn))
        } catch (error){
            warn(`INVALID BOOK: failed to convert '${book}'`)
            warn(error instanceof Error ? error.message : String(error))
            // Remove any partial outputs so the book isn't half-published
            for (const path of [dst_usx, dst_usfm, dst_html, dst_txt, dst_typst]){
                fs.rmSync(path, {force: true})
            }
        }
    }

    // Don't write extra.json if no books were converted
    const dist_books = list_files(join(dist_dir, 'txt'))
    if (!dist_books.length){
        return
    }

    // Skip rebuilding the extra file if nothing changed (keeps incremental runs cheap)
    if (!converted_any && fs.existsSync(join(dist_dir, 'extra.json'))){
        return
    }

    // Extract names/headings (and wj/partial detection) for all books into single file
    const {extra: trans_extra, partial_books} = build_native_extra(dist_dir)
    write_json(join(dist_dir, 'extra.json'), trans_extra)

    // Record which books have only partial content in the source meta so it ends up in the
    // manifest and apps can warn users. This run iterates every dist book, so partial_books is the
    // full picture; only rewrite meta.json when the value actually changes.
    partial_books.sort((a, b) => books_ordered.indexOf(a) - books_ordered.indexOf(b))
    if (JSON.stringify(meta.partial ?? []) !== JSON.stringify(partial_books)){
        if (partial_books.length){
            meta.partial = partial_books
        } else {
            delete meta.partial
        }
        write_json(join(src_dir, 'meta.json'), meta, true)
    }
}
