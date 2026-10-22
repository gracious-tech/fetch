
import {join} from 'path'
import {existsSync, mkdirSync} from 'fs'

import {LICENSES} from '../parts/license.js'
import {z} from 'zod'

import {read_json, request_json} from '../parts/utils.js'
import {translation_source_meta, write_translation_meta} from '../parts/schemas.js'
import {get_language_data} from '../parts/languages.js'

import type {TranslationSourceMeta} from '../parts/types'


// List of Door43 ids to ignore
const IGNORE = [
    'fr_f10',  // Sourced from eBible
    'my_juds',  // Available on eBible
    'zh_cuv',  // Sourced from eBible
]


// Door43 catalog schemas (only the fields used; unknown fields are stripped)
const door43_format = z.object({
    format: z.string(),
    modified: z.string(),
    url: z.url(),
})
type Door43Format = z.infer<typeof door43_format>

const door43_catalog = z.array(z.object({
    language: z.string().min(1),
    direction: z.string(),
    title: z.string(),
    resources: z.array(z.object({
        creator: z.string(),
        formats: z.array(door43_format),
        identifier: z.string().min(1),
        rights: z.string(),
        title: z.string(),
        issued: z.string(),
    })),
}))


function detect_license(rights:string, door43_id:string):{license:string|null, license_url:string}{
    // Detect license data from Door43's "rights" field
    rights = rights.trim().toLowerCase()
    const src_license_url =
        `https://git.door43.org/Door43-Catalog/${door43_id}/src/branch/master/LICENSE.md`
    if (rights.includes('public domain')){
        return {
            license: 'public',
            license_url: src_license_url,
        }
    }
    // Expect e.g. "cc by-sa 4.0" (anything else isn't a recognised license)
    const [family, kind, version] = rights.split(' ')
    const license = `${family ?? ''}-${kind ?? ''}`
    const license_url = `https://creativecommons.org/licenses/${kind ?? ''}/${version ?? ''}/`
    if (kind && version && license in LICENSES){
        return {license, license_url}
    }
    return {license: null, license_url: src_license_url}
}


function select_format(formats:Door43Format[]):Door43Format|null{
    // Select the most appropriate format object (though will usually just be one anyway)
    for (const format of formats){
        if (format['format'].includes('application/zip') && format['format'].includes('text/usfm')){
            return format
        }
    }
    return null
}


export async function discover(existing:string[], discover_specific_id?:string):Promise<void>{
    // Discover new translations
    const stats_bible = await _discover('Bible', existing, discover_specific_id)
    const stats_aligned = await _discover('Aligned_Bible', existing, discover_specific_id)
    const stats_hebrew = await _discover('Hebrew_Old_Testament', existing, discover_specific_id)

    // Report stats
    console.info(`New: ${stats_bible.added + stats_aligned.added + stats_hebrew.added}`)
    console.info(`Existing: ${stats_bible.exists + stats_aligned.exists + stats_hebrew.exists}`)
}


async function _discover(subject:string, existing:string[], discover_specific_id?:string)
        :Promise<{added:number, exists:number}>{
    // Discover new translations for a "subject"
    // Door43 has two subjects for bibles and others for translation notes, stories, etc.

    // Fetch the catalog
    const catalog =
        await request_json(`https://api.door43.org/v3/subjects/${subject}.json`, door43_catalog)

    // Load language data for code conversion
    const languages = get_language_data()

    // Track changes
    const added = []
    const exists = []

    // Loop through language items in the catalog
    // WARN May be multiple entries for same language (data not collated fully for some reason)
    for (const language of catalog){

        // Detect the language
        const lang_code = languages.normalise(language['language'])
        if (!lang_code){
            console.error(`IGNORED language ${language['language']} (unknown code)`)
            continue
        }

        // Loop through languages resources
        for (const resource of language['resources']){

            // Generate ids and paths
            const door43_id = `${language['language']}_${resource['identifier']}`
            const trans_id = `${lang_code}_${resource['identifier']}`
            const log_ids = `${trans_id}/${door43_id}`
            const trans_dir = join('sources', 'bibles', trans_id)
            const meta_file = join(trans_dir, 'meta.json')

            // Ignore if only want to discover a specific translation
            if (discover_specific_id && door43_id !== discover_specific_id){
                continue
            }

            // Skip if exists already
            if (existing.includes(door43_id)){
                exists.push(door43_id)
                continue
            }

            // If already added via another service, add door43 id to it
            if (existsSync(meta_file)){
                const existing_meta = read_json(meta_file, translation_source_meta)
                existing_meta.ids.door43 = door43_id
                write_translation_meta(meta_file, existing_meta)
                exists.push(door43_id)
                continue
            }

            // Ignore for some cases
            if (IGNORE.includes(door43_id)){
                console.warn(`IGNORED ${log_ids} (in ignore list)`)
                continue
            } else if (resource['rights'].toLowerCase().includes('free translate')){
                // Some licenses only allow further translating (not actual use)
                console.warn(`IGNORED ${log_ids} (restricted license)`)
                continue
            }

            // Detect the license
            const {license, license_url} = detect_license(resource['rights'], door43_id)

            // Detect the format
            const format = select_format(resource['formats'])
            if (!format){
                console.error(`IGNORED ${log_ids} (unknown format)`)
                continue
            }

            // Determine year
            const year = parseInt(resource['issued'].slice(0, 4))

            // Prepare meta data
            const translation:TranslationSourceMeta = {
                name: {
                    local: '',
                    local_abbrev: '',
                    english: resource['title'],
                    english_abbrev: resource['identifier'].toUpperCase(),
                },
                year,
                direction: language['direction'] === 'rtl' ? 'rtl' : 'ltr',
                copyright: {
                    attribution: `© ${year} ${resource['creator']}`,
                    // Using git URL since site doesn't have full collection (including non-door43)
                    attribution_url: `https://git.door43.org/Door43-Catalog/${door43_id}`,
                    licenses: license ? [{license, url: license_url}] : [],
                },
                ids: {
                    door43: door43_id,
                },
                source: {
                    service: 'door43',
                    format: 'usfm',
                    url: format['url'],
                    updated: format['modified'].split('T')[0]!,
                    revision: 0,  // Unused
                },
                tags: [],
            }

            // Save meta file
            mkdirSync(trans_dir, {recursive: true})
            write_translation_meta(meta_file, translation)
            added.push(door43_id)
        }
    }

    // Return stats
    return {added: added.length, exists: exists.length}
}
