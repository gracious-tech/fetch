
import {join} from 'path'
import {execSync} from 'node:child_process'
import {copyFileSync, existsSync, readdirSync, renameSync, writeFileSync} from 'fs'

import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import {extract_meta} from './usx.js'
import {update_manifest} from './manifest.js'
import {clean_dir, PKG_PATH, read_json} from './utils.js'
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

    // Wait for all to be updated
    await Promise.all([
        door43.update_sources(door43_sourced),
        ebible.update_sources(ebible_sourced),
    ])
}


function _convert_to_usx(trans:string, format:'usx1-2'|'usfm'|'sword'){
    // Convert translation's source files to USX3 using Bible Multi Converter

    // Determine parts of cmd
    const src_dir = join('sources', trans, format)
    const dist_dir = join('dist', 'bibles', trans, 'usx')
    const bmc_format = {
        'usx1-2': 'USX',
        'usfm': 'USFM',
        'sword': 'SWORD',
    }[format]
    const tool = ['usfm', 'usx1-2'].includes(format) ? 'ParatextConverter' : ''
    const bmc = join(PKG_PATH, 'bmc', 'BibleMultiConverter.jar')

    // Clear existing files
    clean_dir(dist_dir)

    // Execute command
    // NOTE '*' is specific to BMC and is replaced by the book's uppercase code
    const cmd = `java -jar ${bmc} ${tool} ${bmc_format} "${src_dir}" USX3 "${dist_dir}" "*.usx"`
    execSync(cmd, {stdio: 'ignore'})

    // Rename output files to lowercase
    for (const file of readdirSync(dist_dir)){
        renameSync(join(dist_dir, file), join(dist_dir, file.toLowerCase()))
    }
}


export async function update_dist(trans_id?:string){
    // Update distributed HTML/USX files from sources

    // Locate xslt3 executable and XSL template path
    const xslt3 = join(PKG_PATH, 'node_modules', '.bin', 'xslt3')
    const xsl_template = join(PKG_PATH, 'assets/usx3_to_html.xsl')

    // Loop through translations in sources dir
    for (const id of readdirSync('sources')){

        if (trans_id && id !== trans_id){
            continue  // Only updating a single translation
        }

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
            continue
        }

        // Remove previous conversions
        clean_dir(dist_dir)

        // If already USX3+ just copy, otherwise convert
        if (meta.source.format === 'usx3+'){
            for (const file of readdirSync(format_dir)){
                copyFileSync(join('sources', id, 'usx3+', file), join(usx_dir, file))
            }
        } else {
            _convert_to_usx(id, meta.source.format)
        }

        // Convert USX to HTML and extract data
        const extracts:Record<string, BookExtracts> = {}
        for (const file of readdirSync(usx_dir)){

            // Determine paths
            const book = file.split('.')[0]!.toLowerCase()
            const src = join(usx_dir, `${book}.usx`)
            const dst = join(dist_dir, 'html', `${book}.html`)

            // Extract meta data
            extracts[book] = extract_meta(src)

            // Convert to html
            execSync(`${xslt3} -xsl:${xsl_template} -s:${src} -o:${dst}`, {stdio: 'ignore'})
        }

        // Save extracted data to file
        writeFileSync(join('sources', id, 'extracts.json'), JSON.stringify(extracts))
    }

    // Update manifest whenever dist files change
    await update_manifest()
}
