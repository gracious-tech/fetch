
import {join} from 'path'
import {execSync} from 'node:child_process'
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync}
    from 'fs'

import {minify} from 'html-minifier-terser'

import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import {extract_meta} from './usx.js'
import {update_manifest} from './manifest.js'
import {concurrent, PKG_PATH, read_json} from './utils.js'
import type {TranslationSourceMeta, BookExtracts} from './types'


export async function update_source(trans_id?:string){
    // Update the source files for all translations (or single if given)
    // TODO Don't update if update date unchanged

    // Collect meta files by service to better manage concurrency
    const door43_sourced:Record<string, TranslationSourceMeta> = {}
    const ebible_sourced:Record<string, TranslationSourceMeta> = {}

    for (const id of readdirSync('sources')){

        if (trans_id && id !== trans_id){
            continue  // Only updating a single translation
        }

        // Get translation's meta data and allocate to correct service
        const meta = read_json<TranslationSourceMeta>(`sources/${id}/meta.json`)
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
    const src_dir = join('sources', trans, format)
    const dist_dir = join('dist', 'bibles', trans, 'usx')
    const bmc_format = {
        'usx1-2': 'USX',
        'usfm': 'USFM',
        'sword': 'SWORD',  // TODO Not properly implemented yet (not needed yet either)
    }[format]
    const tool = ['usfm', 'usx1-2'].includes(format) ? 'ParatextConverter' : ''
    const bmc = join(PKG_PATH, 'bmc', 'BibleMultiConverter.jar')

    // Skip if already converted
    if (existsSync(dist_dir) && readdirSync(src_dir).length === readdirSync(dist_dir).length){
        return
    }

    // Work around BMC bug by removing any /fig tags
    // See https://github.com/schierlm/BibleMultiConverter/issues/68
    if (format === 'usfm'){
        for (let usfm_file of readdirSync(src_dir)){
            usfm_file = join(src_dir, usfm_file)
            writeFileSync(
                usfm_file,
                readFileSync(usfm_file, {encoding: 'utf-8'}).replace(/\\fig .*\\fig\*/g, ''),
            )
        }
    }

    // Execute command
    // NOTE '*' is specific to BMC and is replaced by the book's uppercase code
    // NOTE keeps space between verses (https://github.com/schierlm/BibleMultiConverter/issues/63)
    const cmd = `java "-Dbiblemulticonverter.paratext.usx.verseseparatortext= " -jar ${bmc}`
        + ` ${tool} ${bmc_format} "${src_dir}" USX3 "${dist_dir}" "*.usx"`
    // NOTE ignoring stdio as converter can output too many warnings and overflow Node's maxBuffer
    //      Should instead manually replay commands that fail to observe output
    //      Problem that prompted this was not inserting verse end markers for some (e.g. vie_ulb)
    execSync(cmd, {stdio: 'ignore'})

    // Rename output files to lowercase
    for (const file of readdirSync(dist_dir)){
        renameSync(join(dist_dir, file), join(dist_dir, file.toLowerCase()))
    }
}


async function _create_extracts(src_dir:string, usx_dir:string):Promise<void>{
    // Extract meta data from USX files and save to sources dir
    const extracts_path = join(src_dir, 'extracts.json')

    if (existsSync(extracts_path)){
        return  // Already exists
    }

    const extracts:Record<string, BookExtracts> = {}
    for (const file of readdirSync(usx_dir)){
        const book = file.split('.')[0]!
        extracts[book] = extract_meta(join(usx_dir, `${book}.usx`))
    }
    writeFileSync(extracts_path, JSON.stringify(extracts, undefined, 4))
}


export async function update_dist(trans_id?:string){
    // Update distributed HTML/USX files from sources

    // Process translations concurrently (only 4 since waiting on processor, not network)
    // NOTE While not multi-threaded itself, conversions done externally... so effectively so
    await concurrent(readdirSync('sources').map(id => async () => {

        if (trans_id && id !== trans_id){
            return  // Only updating a single translation
        }

        // Update assets for the translation
        try {
            await _update_dist_single(id)
        } catch (error){
            console.error(`FAILED update dist assets for: ${id}`)
            console.error(`${error as string}`)
        }
    }), 4)

    // Update manifest whenever dist files change
    await update_manifest()
}


async function _update_dist_single(id:string){
    // Update distributable files for given translation
    // NOTE This should only have one external process running (concurrency done at higher level)

    // Determine paths
    const src_dir = join('sources', id)
    const dist_dir = join('dist', 'bibles', id)
    const usx_dir = join(dist_dir, 'usx')

    // Get translation's meta data
    const meta = read_json<TranslationSourceMeta>(join(src_dir, 'meta.json'))

    // Confirm have downloaded source already
    const format_dir = join(src_dir, meta.source.format)
    if (!existsSync(format_dir)){
        console.warn(`IGNORED ${id} (no source)`)
        return
    }

    // Ensure dist dirs exist
    for (const format of ['usx', 'usfm', 'html', 'txt']){
        mkdirSync(join(dist_dir, format), {recursive: true})
    }

    // If already USX3+ just copy, otherwise convert
    if (meta.source.format === 'usx3+'){
        for (const file of readdirSync(format_dir)){
            copyFileSync(join(format_dir, file), join(usx_dir, file))
        }
    } else {
        await _convert_to_usx(id, meta.source.format)
    }

    // If already USFM just copy, otherwise convert
    if (meta.source.format === 'usfm'){
        for (const file of readdirSync(format_dir)){
            copyFileSync(join(format_dir, file), join(dist_dir, 'usfm', file))
        }
    } else {
        throw new Error("Conversion to USFM is waiting on https://github.com/usfm-bible/tcdocs")
    }

    // Extract meta data from the USX files
    await _create_extracts(src_dir, usx_dir)

    // Locate xslt3 executable and XSL template dir
    const xslt3 = join(PKG_PATH, 'node_modules', '.bin', 'xslt3')
    const xsl_template_html = join(PKG_PATH, 'assets', 'usx_transforms', 'usx_to_html.xslt')
    const xsl_template_txt = join(PKG_PATH, 'assets', 'usx_transforms', 'usx_to_txt.xslt')

    // Convert USX to HTML and plain text
    for (const file of readdirSync(usx_dir)){

        // Determine paths
        const book = file.split('.')[0]!.toLowerCase()
        const src = join(usx_dir, `${book}.usx`)
        const dst_html = join(dist_dir, 'html', `${book}.html`)
        const dst_txt = join(dist_dir, 'txt', `${book}.txt`)

        // Convert to HTML if doesn't exist yet
        if (!existsSync(dst_html)){
            execSync(`${xslt3} -xsl:${xsl_template_html} -s:${src} -o:${dst_html}`)
            // Minify the HTML (since HTML isn't as strict as XML/JSON can remove quotes etc)
            writeFileSync(dst_html, await minify(readFileSync(dst_html, 'utf-8'), {
                // Just enable relevent options since we create HTML ourself and many aren't issues
                collapseWhitespace: true,  // Get rid of useless whitespace
                conservativeCollapse: true,  // Leave gap between spans etc or words will join
                removeAttributeQuotes: true,  // Allowed by spec and browsers can still parse
                decodeEntities: true,  // Don't use &..; if can just use UTF-8 char (e.g. hun_kar)
            }))
        }

        // Convert to plain text if doesn't exist yet
        if (!existsSync(dst_txt)){
            execSync(`${xslt3} -xsl:${xsl_template_txt} -s:${src} -o:${dst_txt}`)
        }
    }
}
