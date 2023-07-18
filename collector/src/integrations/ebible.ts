
import {join} from 'path'
import {existsSync, mkdirSync, writeFileSync} from 'fs'

import {parse as csv_parse} from 'csv-parse/sync'

import {request, concurrent} from '../parts/utils.js'
import {LICENSES, detect_year} from '../parts/license.js'
import {get_language_data} from '../parts/languages.js'
import type {TranslationSourceMeta} from '../parts/types'


interface EbibleRow {
    translationId:string
    FCBHID:string
    title:string
    description:string
    shortTitle:string
    languageCode:string
    textDirection:string
    Copyright:string
    UpdateDate:string
    swordName:string
}


export async function discover(discover_specific_id?:string):Promise<void>{
    // Discover translations that are available

    // Parse eBible CSV to get translations list and useful metadata
    const csv_buffer =
        await request('https://ebible.org/Scriptures/translations.csv', 'arrayBuffer')
    const rows = csv_parse(Buffer.from(csv_buffer), {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as EbibleRow[]

    // Load language data
    const language_data = get_language_data()

    // Track changes
    const added = []
    const exists = []

    // Add each translation in the CSV file
    // Do concurrently since each involves a network request
    await concurrent(rows.map(row => async () => {

        // Warn if invalid language
        const ebible_id = row['translationId']
        const lang_code = language_data.normalise(row['languageCode'])
        if (!lang_code){
            console.error(`IGNORED ${ebible_id} (unknown language)`)
            return
        }

        // Determine ids
        const trans_abbr = row['FCBHID'].slice(3).toLowerCase()
        const trans_id = `${lang_code}_${trans_abbr}`
        const log_ids = `${trans_id}/${ebible_id}`

        // Skip if only want to discover a single translation
        if (discover_specific_id && trans_id !== discover_specific_id){
            return
        }

        // Skip if already discovered
        const trans_dir = join('sources', 'bibles', trans_id)
        const meta_file = join(trans_dir, 'meta.json')
        if (existsSync(meta_file)){
            exists.push(ebible_id)
            return
        }

        // Get translation's details page to see what data formats are available
        const ebible_url = `https://ebible.org/Scriptures/details.php?id=${ebible_id}`
        let page_resp = await request(ebible_url, 'text')

        // Some pages have broken license links
        page_resp = page_resp.replaceAll('/by4.0/', '/by/4.0/')

        // Detect the license
        let license:string|null = null
        let license_url = ebible_url
        const cc_url = /creativecommons.org\/licenses\/([a-z-]+)\/(\d+\.\d+)/i.exec(page_resp)
        if (cc_url){
            license = `cc-${cc_url[1]!}`
            if (license in LICENSES){
                license_url = `https://creativecommons.org/licenses/${cc_url[1]!}/${cc_url[2]!}/`
            } else {
                console.error(`Failed to detect CC license: ${license}`)
                license = null
            }
        } else if (/public domain/i.test(page_resp) && !/not public domain/i.test(page_resp)){
            license = 'public'
        }

        // Ignore if no USFM source (almost always because license is restrictive)
        if (!page_resp.includes('usfm.zip')){
            if (license){
                console.error(`IGNORED ${log_ids} (no USFM even though unrestricted license?)`)
            } else {
                console.warn(`IGNORED ${log_ids} (probably restricted)`)
            }
            return
        }

        // Guess if title is in English or native language (printable ASCII)
        const title_is_english = /^[\x20-\x7F]*$/.test(row['title'])

        // Prepare the meta data
        const meta:TranslationSourceMeta = {
            name: {
                local: title_is_english ? '' : row['title'],
                abbrev: trans_abbr.toUpperCase(),  // WARN Often in English (should be native)
                english: title_is_english ? row['title'] : '',
            },
            language: lang_code,
            year: detect_year(row['title'], row['shortTitle'], row['translationId'],
                row['swordName'], row['Copyright'], row['description']),
            direction: row['textDirection'] === 'rtl' ? 'rtl' : 'ltr',
            copyright: {
                licenses: license ? [{license, url: license_url}] : [],
                attribution: row['Copyright'],
                attribution_url: ebible_url,
            },
            audio: [],
            video: [],
            source: {
                service: 'ebible',
                id: ebible_id,
                format: 'usfm',
                url: `https://ebible.org/Scriptures/${ebible_id}_usfm.zip`,
                updated: row['UpdateDate'],
            },
            recommended: null,
            reviewed: false,
        }

        // Save meta file
        mkdirSync(trans_dir, {recursive: true})
        writeFileSync(meta_file, JSON.stringify(meta, undefined, 4))
        added.push(ebible_id)
    }))

    // Report stats
    console.info(`New: ${added.length}`)
    console.info(`Existing: ${exists.length}`)
}


// Generic method is compatible with this service's source format
export {generic_update_sources as update_sources} from './generic.js'
