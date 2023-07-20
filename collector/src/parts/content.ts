
import fs from 'node:fs'
import {join} from 'node:path'
import {execSync} from 'node:child_process'

import {usx_to_html} from 'usx-to-html'
import {JSDOM} from 'jsdom'

import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import {extract_meta} from './usx.js'
import {update_manifest} from './manifest.js'
import {concurrent, PKG_PATH, read_json, read_dir} from './utils.js'
import type {TranslationSourceMeta, BookExtracts} from './types'


export async function update_source(trans_id?:string){
    // Update the source files for all translations (or single if given)
    // TODO Don't update if update date unchanged

    // Collect meta files by service to better manage concurrency
    const door43_sourced:Record<string, TranslationSourceMeta> = {}
    const ebible_sourced:Record<string, TranslationSourceMeta> = {}

    for (const id of read_dir(join('sources', 'bibles'))){

        if (trans_id && id !== trans_id){
            continue  // Only updating a single translation
        }

        // Get translation's meta data and allocate to correct service
        const meta = read_json<TranslationSourceMeta>(join('sources', 'bibles', id, 'meta.json'))
        if (meta.source.service === 'door43'){
            door43_sourced[id] = meta
        } else if (meta.source.service === 'ebible'){
            ebible_sourced[id] = meta
        }
    }

    // Fail if nothing matched
    if (Object.keys(door43_sourced).length + Object.keys(ebible_sourced).length === 0){
        console.error("No translations identified")
    }

    // Wait for all to be updated
    await Promise.all([
        door43.update_sources(door43_sourced),
        ebible.update_sources(ebible_sourced),
    ])
}


async function _convert_to_usx(trans:string, format:'usx1-2'|'usfm'){
    // Convert translation's source files to USX3 using Bible Multi Converter

    // Determine parts of cmd
    const src_dir = join('sources', 'bibles', trans, format)
    const dist_dir = join('dist', 'bibles', trans, 'usx')
    const bmc_format = {
        'usx1-2': 'USX',
        'usfm': 'USFM',
        'sword': 'SWORD',  // TODO Not properly implemented yet (not needed yet either)
    }[format]
    const tool = ['usfm', 'usx1-2'].includes(format) ? 'ParatextConverter' : ''
    const bmc = join(PKG_PATH, 'bmc', 'BibleMultiConverter.jar')

    // Skip if already converted
    if (fs.existsSync(dist_dir)
            && read_dir(src_dir).length === read_dir(dist_dir).length){
        return
    }

    // Work around BMC bug by removing any /fig tags
    // See https://github.com/schierlm/BibleMultiConverter/issues/68
    if (format === 'usfm'){
        for (let usfm_file of read_dir(src_dir)){
            usfm_file = join(src_dir, usfm_file)
            fs.writeFileSync(
                usfm_file,
                fs.readFileSync(usfm_file, {encoding: 'utf-8'}).replace(/\\fig .*\\fig\*/g, ''),
            )
        }
    }

    // Execute command

    // Workaround for Java 16+ (See https://stackoverflow.com/questions/68117860/)
    const args_fix = '--illegal-access=warn --add-opens java.base/java.lang=ALL-UNNAMED'

    // NOTE '*' is specific to BMC and is replaced by the book's uppercase code
    // NOTE keeps space between verses (https://github.com/schierlm/BibleMultiConverter/issues/63)
    const cmd = `java ${args_fix} "-Dbiblemulticonverter.paratext.usx.verseseparatortext= " -jar ${bmc}`
        + ` ${tool} ${bmc_format} "${src_dir}" USX3 "${dist_dir}" "*.usx"`
    // NOTE ignoring stdio as converter can output too many warnings and overflow Node's maxBuffer
    //      Should instead manually replay commands that fail to observe output
    //      Problem that prompted this was not inserting verse end markers for some (e.g. vie_ulb)
    execSync(cmd, {stdio: 'ignore'})

    // Rename output files to lowercase
    for (const file of read_dir(dist_dir)){
        fs.renameSync(join(dist_dir, file), join(dist_dir, file.toLowerCase()))
    }
}


async function _create_extracts(src_dir:string, usx_dir:string):Promise<void>{
    // Extract meta data from USX files and save to sources dir
    const extracts_path = join(src_dir, 'extracts.json')

    if (fs.existsSync(extracts_path)){
        return  // Already exists
    }

    const extracts:Record<string, BookExtracts> = {}
    for (const file of read_dir(usx_dir)){
        const book = file.split('.')[0]!
        extracts[book] = extract_meta(join(usx_dir, `${book}.usx`))
    }
    fs.writeFileSync(extracts_path, JSON.stringify(extracts, undefined, 4))
}


export async function update_dist(trans_id?:string){
    // Update distributed HTML/USX files from sources

    // Process translations concurrently (only 4 since waiting on processor, not network)
    // NOTE While not multi-threaded itself, conversions done externally... so effectively so
    await concurrent(read_dir(join('sources', 'bibles')).map(id => async () => {

        if (trans_id && id !== trans_id){
            return  // Only updating a single translation
        }

        // Update assets for the translation
        try {
            await _update_dist_single(id)
        } catch (error){
            console.error(`FAILED update dist assets for: ${id}`)
            console.error(error instanceof Error ? error.stack : error)
        }
    }), 4)

    // Update manifest whenever dist files change
    await update_manifest()
}


async function _update_dist_single(id:string){
    // Update distributable files for given translation
    // NOTE This should only have one external process running (concurrency done at higher level)

    // Determine paths
    const src_dir = join('sources', 'bibles', id)
    const dist_dir = join('dist', 'bibles', id)
    const usx_dir = join(dist_dir, 'usx')

    // Ignore if not a dir (e.g. sources/.DS_Store)
    if (!fs.statSync(src_dir).isDirectory()){
        return
    }

    // Get translation's meta data
    const meta = read_json<TranslationSourceMeta>(join(src_dir, 'meta.json'))

    // Confirm have downloaded source already
    const format_dir = join(src_dir, meta.source.format)
    if (!fs.existsSync(format_dir)){
        console.warn(`IGNORED ${id} (no source)`)
        return
    }

    // Ensure dist dirs exist
    for (const format of ['usx', 'usfm', 'html', 'txt']){
        fs.mkdirSync(join(dist_dir, format), {recursive: true})
    }

    // If already USX3+ just copy, otherwise convert
    if (meta.source.format === 'usx3+'){
        for (const file of read_dir(format_dir)){
            fs.copyFileSync(join(format_dir, file), join(usx_dir, file))
        }
    } else {
        await _convert_to_usx(id, meta.source.format)
    }

    // If already USFM just copy, otherwise convert
    if (meta.source.format === 'usfm'){
        for (const file of read_dir(format_dir)){
            fs.copyFileSync(join(format_dir, file), join(dist_dir, 'usfm', file))
        }
    } else {
        throw new Error("Conversion to USFM is waiting on https://github.com/usfm-bible/tcdocs")
    }

    // Extract meta data from the USX files
    await _create_extracts(src_dir, usx_dir)

    // Convert USX to HTML and plain text
    const parser = new JSDOM().window.DOMParser
    for (const file of read_dir(usx_dir)){

        // Determine paths
        const book = file.split('.')[0]!.toLowerCase()
        const src = join(usx_dir, `${book}.usx`)
        const dst_html = join(dist_dir, 'html', `${book}.json`)

        // Convert to HTML if doesn't exist yet
        if (!fs.existsSync(dst_html)){
            const html = usx_to_html(fs.readFileSync(src, {encoding: 'utf8'}), parser)
            fs.writeFileSync(dst_html, JSON.stringify(html))
        }
    }
}
