
import {join} from 'path'
import {promisify} from 'node:util'
import {exec} from 'node:child_process'
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync}
    from 'fs'

import {minify} from 'html-minifier-terser'

import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import {extract_meta} from './usx.js'
import {update_manifest} from './manifest.js'
import {concurrent, PKG_PATH, read_json} from './utils.js'
import type {TranslationSourceMeta, BookExtracts} from './types'


const execAsync = promisify(exec)


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

    // Execute command
    // NOTE '*' is specific to BMC and is replaced by the book's uppercase code
    const cmd = `java -jar ${bmc} ${tool} ${bmc_format} "${src_dir}" USX3 "${dist_dir}" "*.usx"`
    await execAsync(cmd)

    // Rename output files to lowercase
    for (const file of readdirSync(dist_dir)){
        renameSync(join(dist_dir, file), join(dist_dir, file.toLowerCase()))
    }
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

    // Ensure dist dir exists
    mkdirSync(dist_dir, {recursive: true})

    // If already USX3+ just copy, otherwise convert
    if (meta.source.format === 'usx3+'){
        for (const file of readdirSync(format_dir)){
            copyFileSync(join('sources', id, 'usx3+', file), join(usx_dir, file))
        }
    } else {
        await _convert_to_usx(id, meta.source.format)
    }

    // Locate xslt3 executable and XSL template path
    const xslt3 = join(PKG_PATH, 'node_modules', '.bin', 'xslt3')
    const xsl_template = join(PKG_PATH, 'assets/usx3_to_html/main.xslt')

    // Convert USX to HTML and extract data
    const extracts:Record<string, BookExtracts> = {}
    for (const file of readdirSync(usx_dir)){

        // Determine paths
        const book = file.split('.')[0]!.toLowerCase()
        const src = join(usx_dir, `${book}.usx`)
        const dst = join(dist_dir, 'html', `${book}.html`)

        // Start conversion to html
        const convert_html_process = execAsync(`${xslt3} -xsl:${xsl_template} -s:${src} -o:${dst}`)

        // Extract meta data (while HTML conversion is happening)
        extracts[book] = extract_meta(src)

        // Minify the HTML (since HTML isn't as strict as XML/JSON can remove quotes etc)
        await convert_html_process
        writeFileSync(dst, await minify(readFileSync(dst, 'utf-8'), {
            // Just enable relevent options since we create HTML ourself and many aren't an issue
            collapseWhitespace: true,  // Get rid of useless whitespace
            removeAttributeQuotes: true,  // Browsers can still parse without quotes
            decodeEntities: true,  // Don't use &..; if can just use UTF-8 char
        }))
    }

    // Save extracted data to file
    writeFileSync(join('sources', id, 'extracts.json'), JSON.stringify(extracts))
}
