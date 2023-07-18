
import {join} from 'path'
import {writeFileSync, existsSync, mkdirSync} from 'fs'

import {LICENSES} from '../parts/license.js'
import {request} from '../parts/utils.js'
import {get_language_data} from '../parts/languages.js'
import type {TranslationSourceMeta} from '../parts/types'


// List of Door43 ids to ignore
const IGNORE = [
    'fr_f10',  // Sourced from eBible
    'my_juds',  // Available on eBible
    'zh_cuv',  // Sourced from eBible
]


interface Door43Language {
    language:string
    resources:Door43Resource[]
    direction:string
    title:string
}


interface Door43Resource {
    creator:string
    formats:Door43Format[]
    identifier:string
    rights:string
    title:string
    issued:string
}

interface Door43Format {
    format:string
    modified:string
    url:string
}


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
    const parts = rights.split(' ')
    const license = `${parts[0]!}-${parts[1]!}`
    const version = parts[2]
    const license_url = `https://creativecommons.org/licenses/${parts[1]!}/${version!}/`
    if (license in LICENSES){
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


export async function discover(discover_specific_id?:string):Promise<void>{
    // Discover new translations
    const stats_bible = await _discover('Bible', discover_specific_id)
    const stats_aligned = await _discover('Aligned_Bible', discover_specific_id)

    // Report stats
    console.info(`New: ${stats_bible.added + stats_aligned.added}`)
    console.info(`Existing: ${stats_bible.exists + stats_aligned.exists}`)
}


async function _discover(subject:'Bible'|'Aligned_Bible', discover_specific_id?:string)
        :Promise<{added:number, exists:number}>{
    // Discover new translations for a "subject"
    // Door43 has two subjects for bibles and others for translation notes, stories, etc.

    // Fetch the catalog
    const catalog =
        await request<Door43Language[]>(`https://api.door43.org/v3/subjects/${subject}.json`)

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
            if (discover_specific_id && trans_id !== discover_specific_id){
                continue
            }

            // Ignore if already exists or an issue
            if (existsSync(meta_file)){
                exists.push(door43_id)
                continue
            } else if (IGNORE.includes(door43_id)){
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
                    // WARN Shouldn't be in English but is
                    abbrev: `${language['language']}-${resource['identifier']}`.toUpperCase(),
                    english: resource['title'],
                },
                language: lang_code,
                year,
                direction: language['direction'] === 'rtl' ? 'rtl' : 'ltr',
                copyright: {
                    attribution: `© ${year} ${resource['creator']}`,
                    // Using git URL since site doesn't have full collection (including non-door43)
                    attribution_url: `https://git.door43.org/Door43-Catalog/${door43_id}`,
                    licenses: license ? [{license, url: license_url}] : [],
                },
                audio: [],
                video: [],
                source: {
                    service: 'door43',
                    id: door43_id,
                    format: 'usfm',
                    url: format['url'],
                    updated: format['modified'].split('T')[0]!,
                },
                recommended: null,
                reviewed: false,
            }

            // Save meta file
            mkdirSync(trans_dir, {recursive: true})
            writeFileSync(meta_file, JSON.stringify(translation, undefined, 4))
            added.push(door43_id)
        }
    }

    // Return stats
    return {added: added.length, exists: exists.length}
}


// Generic method is compatible with this service's source format
export {generic_update_sources as update_sources} from './generic.js'
