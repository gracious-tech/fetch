
import fs from 'node:fs'
import {join} from 'node:path'
import {execSync} from 'node:child_process'

import {usx_to_json_html, usx_to_json_txt} from 'usx-to-json'
import {reverse_usx} from 'reverse-usx'
import {JSDOM} from 'jsdom'

import {pre_usx_to_json} from '../integrations/patches.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'
import {concurrent, PKG_PATH, read_json, write_json, list_files, list_dirs} from '../parts/utils.js'
import {extract_sections, generate_chapter_headings} from '../parts/sections.js'
import {rm_mark_second_ending} from '../parts/mark_ending.js'

import type {TranslationSourceMeta} from '../parts/types.js'
import type {BibleJsonTxt, DistTranslationExtra} from '../parts/shared_types.js'


const DOM = new JSDOM()
const DOMParser = DOM.window.DOMParser
const XMLSerializer = DOM.window.XMLSerializer


async function _source_to_distributable(trans:string, from:'usx'|'usfm', to:'usx'|'usfm',
        src_dir_type:'sources'|'dist'='sources'):Promise<void>{
    // Convert translation's source files to an equivalent distributable format (USFM or USX)

    const src_dir = join(src_dir_type, 'bibles', trans, from)
    const dist_dir = join('dist', 'bibles', trans, to)

    // Skip if already converted
    const valid_src_files = list_files(src_dir).filter(f => !f.endsWith('.invalid')).length
    if (valid_src_files === list_files(dist_dir).length){
        return
    }
    console.info(`Converting ${trans} to ${to}`)

    // If converting from USX need to know whether version is 3+ or not
    let source_is_usx3 = false
    if (from === 'usx'){
        const first_file = list_files(src_dir)[0]
        if (first_file){
            const contents = fs.readFileSync(join(src_dir, first_file), {encoding: 'utf8'})
            const usx_version = /<usx version="([\d.]+)">/.exec(contents)
            source_is_usx3 = parseFloat(usx_version?.[1] ?? '0') >= 3
        }
    }

    // If converting to same format, simply copy the files
    // WARN USFM1-2 is valid USFM3, but USX1-2 must be converted to USX3 which requires end markers
    if (from === to && (from === 'usfm' || source_is_usx3)){
        for (const file of list_files(src_dir).filter(f => !f.endsWith('.invalid'))){
            fs.copyFileSync(join(src_dir, file), join(dist_dir, file))
        }
        return
    }

    // Determine parts of cmd
    const from_format = {
        'usx': source_is_usx3 ? 'USX3' : 'USX',
        'usfm': 'USFM',
    }[from]
    const to_format = to === 'usfm' ? 'USFM' : 'USX3'
    const tool = ['usfm', 'usx'].includes(from) ? 'ParatextConverter' : ''
    const bmc = join(PKG_PATH, 'bmc', 'BibleMultiConverter-AllInOneEdition.jar')

    // Execute command

    // Workaround for Java 16+ (See https://stackoverflow.com/questions/68117860/)
    const args_fix = '--add-opens java.base/java.lang=ALL-UNNAMED'

    // NOTE '*' is specific to BMC and is replaced by the book's uppercase code
    // NOTE keeps space between verses (https://github.com/schierlm/BibleMultiConverter/issues/63)
    const cmd = `java ${args_fix} "-Dbiblemulticonverter.paratext.usx.verseseparatortext= " -jar ${bmc}`
        + ` ${tool} ${from_format} "${src_dir}" ${to_format} "${dist_dir}" "*.${to}"`
    // NOTE ignoring stdio as converter can output too many warnings and overflow Node's maxBuffer
    //      Should instead manually replay commands that fail to observe output
    //      Problem that prompted this was not inserting verse end markers for some (e.g. vie_ulb)
    try {
        execSync(cmd, {stdio: 'ignore'})
    } finally {
        // Rename output files to lowercase
        for (const file of list_files(dist_dir)){
            fs.renameSync(join(dist_dir, file), join(dist_dir, file.toLowerCase()))
        }
    }
}


export async function update_dist(trans_id?:string){
    // Update distributed HTML/USX files from sources

    // Force recreate distributables if updating a specific translation
    const force = !!trans_id

    // Process translations concurrently (only 4 since waiting on processor, not network)
    // NOTE While not multi-threaded itself, conversions done externally... so effectively so
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
    // Update distributable files for given translation
    // NOTE This should only have one external process running (concurrency done at higher level)

    // Determine paths
    const src_dir = join('sources', 'bibles', id)
    const dist_dir = join('dist', 'bibles', id)

    // Get translation's meta data
    const meta_file_path = join(src_dir, 'meta.json')
    const meta = read_json<TranslationSourceMeta>(meta_file_path)

    // Confirm have downloaded source already
    const format_dir = join(src_dir, meta.source.format)
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

    // Convert source to USX3 (if needed)
    await _source_to_distributable(id, meta.source.format, 'usx')

    // Default to producing USFM from source (not dist/usx)
    let usfm_from = meta.source.format
    let usfm_from_dir:'sources'|'dist' = 'sources'

    // Convert versification of any books if needed
    for (const file of list_files(join(dist_dir, 'usx'))){
        const file_path = join(dist_dir, 'usx', file)
        const contents = fs.readFileSync(file_path, 'utf8')
        let reversed:string|undefined
        try {
            reversed = reverse_usx(contents, DOMParser, XMLSerializer)
            if (file === 'mrk.usx'){
                reversed = rm_mark_second_ending(reversed)
            }
        } catch {
            console.error(`Failed to re-verse ${file_path}`)
        }

        // If contents unchanged then didn't need to reverse
        if (contents === reversed){
            continue
        } else {

            // Distributed USX needed reversing so rm any other dist formats to ensure redo
            for (const format of ['usfm', 'html', 'txt']){
                const ext = format === 'usfm' ? 'usfm' : 'json'
                fs.rmSync(join(dist_dir, format, file.replace('usx', ext)), {force: true})
            }

            if (reversed){
                fs.writeFileSync(file_path, reversed)
            } else {
                // Failed to re-verse, rm the dist USX to stop other formats copying wrong numbering
                fs.unlinkSync(file_path)
            }

            // Ensure USFM is produced from re-versed USX and not source
            usfm_from = 'usx'
            usfm_from_dir = 'dist'
        }
    }

    // Convert source to USFM3 (if needed)
    await _source_to_distributable(id, usfm_from, 'usfm', usfm_from_dir)

    // Convert distributable USX to HTML and plain text
    const usx_dir = join(dist_dir, 'usx')
    for (const file of list_files(usx_dir)){

        // Determine paths
        const book = file.split('.')[0]!
        const src = join(usx_dir, `${book}.usx`)
        const dst_html = join(dist_dir, 'html', `${book}.json`)
        const dst_txt = join(dist_dir, 'txt', `${book}.json`)

        // Apply patches
        let usx_str = fs.readFileSync(src, {encoding: 'utf8'})
        usx_str = pre_usx_to_json(id, book, usx_str)

        // Convert to plain text if doesn't exist yet
        if (!fs.existsSync(dst_txt)){
            try {
                const txt = usx_to_json_txt(usx_str, DOMParser)
                write_json(dst_txt, txt)
            } catch (error){
                console.warn(`INVALID BOOK: failed to convert '${book}' to txt for ${id}`)
                console.error(error)
            }
        }

        // Convert to HTML if doesn't exist yet
        if (!fs.existsSync(dst_html)){
            try {
                const html = usx_to_json_html(usx_str, false, DOMParser)
                write_json(dst_html, html)
            } catch (error){
                console.warn(`INVALID BOOK: failed to convert '${book}' to html for ${id}`)
                console.error(error)
            }
        }
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
