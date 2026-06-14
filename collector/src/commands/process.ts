
import fs from 'node:fs'
import {join} from 'node:path'

import {usx_to_json_html, usx_to_json_txt} from 'usx-to-json'
import {reverse_usx} from 'reverse-usx'
import {JSDOM} from 'jsdom'

import {pre_usx_to_json} from '../integrations/patches.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'
import {concurrent, read_json, write_json, list_files, list_dirs} from '../parts/utils.js'
import {extract_sections, generate_chapter_headings} from '../parts/sections.js'
import {rm_mark_second_ending} from '../parts/mark_ending.js'
import {convert} from '../parts/usfmtc.js'

import type {TranslationSourceMeta} from '../parts/types.js'
import type {BibleJsonTxt, DistTranslationExtra} from '../parts/shared_types.js'


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

    // Update manifest whenever dist files change
    await update_manifest()
}


async function _update_dist_single(id:string, force:boolean){
    // Update distributable files for given translation, converting each book in-memory

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
    for (const format of ['usx', 'usfm', 'html', 'txt']){
        fs.mkdirSync(join(dist_dir, format), {recursive: true})
    }

    // Convert each source book through the in-memory pipeline
    let converted_any = false
    for (const file of list_files(format_dir).filter(f => !f.endsWith('.invalid'))){
        const book = file.split('.')[0]!
        const dst_usx = join(dist_dir, 'usx', `${book}.usx`)
        const dst_usfm = join(dist_dir, 'usfm', `${book}.usfm`)
        const dst_html = join(dist_dir, 'html', `${book}.json`)
        const dst_txt = join(dist_dir, 'txt', `${book}.json`)

        // Skip book if all distributable formats already exist (incremental, non-forced runs)
        if (fs.existsSync(dst_usx) && fs.existsSync(dst_usfm)
                && fs.existsSync(dst_html) && fs.existsSync(dst_txt)){
            continue
        }
        converted_any = true

        try {
            const src_text = fs.readFileSync(join(format_dir, file), {encoding: 'utf8'})

            // Produce USX3: keep source as-is if already USX3, else convert (adding verse end
            // markers). WARN Re-adding esids to already-esid'd USX makes usfmtc emit stray
            // chapter markers, so only convert when the source lacks them (USFM or USX1/2).
            const source_is_usx3 = src_fmt === 'usx'
                && parseFloat(/<usx version="([\d.]+)">/.exec(src_text)?.[1] ?? '0') >= 3
            let usx = source_is_usx3
                ? src_text
                : await convert(src_text, src_fmt, 'usx', true)

            // Normalise versification to the standard 66-book numbering
            let reversed:string
            try {
                reversed = reverse_usx(usx, DOMParser, XMLSerializer)
                if (book === 'mrk'){
                    reversed = rm_mark_second_ending(reversed)
                }
            } catch (error){
                // Drop the book rather than publish possibly-wrong numbering (as before)
                console.error(`Failed to re-verse ${id}/${book} — dropping book`)
                console.error(error instanceof Error ? error.message : error)
                for (const path of [dst_usx, dst_usfm, dst_html, dst_txt]){
                    fs.rmSync(path, {force: true})
                }
                continue
            }
            const did_reverse = reversed !== usx
            usx = reversed
            fs.writeFileSync(dst_usx, usx)

            // Produce USFM: copy unchanged source USFM, else derive from the (re-versed) USX
            const usfm = src_fmt === 'usfm' && !did_reverse
                ? src_text
                : await convert(usx, 'usx', 'usfm')
            fs.writeFileSync(dst_usfm, usfm)

            // Convert USX to HTML and plain text JSON (after applying source-quirk patches)
            const patched = pre_usx_to_json(id, book, usx)
            write_json(dst_txt, usx_to_json_txt(patched, DOMParser))
            write_json(dst_html, usx_to_json_html(patched, false, DOMParser))
        } catch (error){
            console.warn(`INVALID BOOK: failed to convert '${book}' for ${id}`)
            console.error(error instanceof Error ? error.message : error)
            // Remove any partial outputs so the book isn't half-published
            for (const path of [dst_usx, dst_usfm, dst_html, dst_txt]){
                fs.rmSync(path, {force: true})
            }
        }
    }

    // Skip rebuilding the extra file if nothing changed (keeps incremental runs cheap)
    if (!converted_any && fs.existsSync(join(dist_dir, 'extra.json'))){
        return
    }

    // Extract names/headings for all books into single file for translation
    const trans_extra:DistTranslationExtra = {book_names: {}, chapter_headings: {}, sections: {}}
    for (const filename of list_files(join(dist_dir, 'txt'))){

        // Determine paths and read data from txt format output
        const book = filename.split('.')[0]!
        const file_path = join(dist_dir, 'txt', filename)
        const json_txt = JSON.parse(fs.readFileSync(file_path, {encoding: 'utf8'})) as BibleJsonTxt

        // Extract extra data required
        trans_extra.book_names[book] = json_txt.name
        trans_extra.sections[book] = extract_sections(json_txt)
        // WARN Below also sets any chapter start sections to null to reduce data transfer
        trans_extra.chapter_headings[book] =
            generate_chapter_headings(json_txt, trans_extra.sections[book]!)
    }
    write_json(join(dist_dir, 'extra.json'), trans_extra)
}
