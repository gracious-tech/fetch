
import {join} from 'node:path'
import {existsSync, mkdirSync} from 'node:fs'
import {createHmac} from 'node:crypto'

import {request, concurrent, write_json, read_json} from '../parts/utils.js'
import {LICENSES} from '../parts/license.js'
import {get_language_data} from '../parts/languages.js'

import type {TranslationSourceMeta} from '../parts/types'


// Base URL for the DBL API
const DBL_API = 'https://api.library.bible/v1'


// Build the X-DBL-Authorization header value for a DBL API request
export function dbl_headers(url:string, method='GET'):Record<string, string> {

    // WARN DBL gives out keys in uppercase but actually need to be lowercase :/
    const api_key = (process.env['DBL_API_KEY'] ?? '').toLowerCase()
    const api_secret = (process.env['DBL_API_SECRET'] ?? '').toLowerCase()
    if (!api_key || !api_secret){
        throw new Error('DBL_API_KEY and DBL_API_SECRET env vars required'
            + ' — see https://care.library.bible/article/147-add-and-manage-access-tokens')
    }

    const path = new URL(url).pathname
    const date = new Date().toUTCString()
    const signing = `${method} ${path}\n\n${date}\n`
    const sig = createHmac('sha1', api_key).update(signing + api_secret).digest('hex')
    return {
        'Accept': 'application/json',
        'Date': date,
        'X-DBL-Authorization': `version=v1,token=${api_key},signature=${sig}`,
    }
}


// Translations that can be sourced from a better location (or other issue)
const IGNORE:string[] = [
    '69ffe7eecd894e52',  // Only second half of genesis
]

// Some language codes are outdated
const OUTDATED_LANG:Record<string, string> = {cug: 'cnq', plj: 'zlu'}



interface ListContentEntriesResponse {
    items:ContentEntryDetailed[]
    totalCount:number
}

interface ContentEntry {
    uid:string
    countries?:{name:string, isoCode?:string}[]
    isConfidential?:boolean
    isLatest?:boolean
    isObsolete?:boolean
    language?:{isoCode?:string, name?:string}
    latestRevision:number
    medium?:'audio'|'braille'|'paratextZipResource'|'print'|'text'|'video'
    name:string
    providedByOrg?:{uid:string, name:string}
    primaryLicensorOrg?:{uid:string, name:string}
}

interface ContentEntryDetailed extends ContentEntry {
    // Fields only present when include_full_details=true or from details endpoint
    // NOTE Haven't included some fields that are unlikely to be of use
    language?:{
        isoCode?:string
        name?:string
        nameLocal?:string
        numeralSystem?:string
        scriptCode?:string
        scriptDirection?:'LTR'|'RTL'
        scriptName?:string
    }
    copyrightStatement?:string
    dateFirstSubmitted?:string  // ISO 8601 datetime e.g. "2014-04-24T11:18:58.804614"
    dateUpdated?:string  // ISO 8601 datetime e.g. "2014-04-24T20:18:57.819830"
    dateTranslationFinished?:string  // ISO 8601 datetime (absent if not set)
    description?:string
    nameLocal?:string
    nameAbbreviation?:string
    nameAbbreviationLocal?:string
    promotionInfo?:string
    revision?:number
    revisionComment?:string
    scope?:string  // E.g. OT, NT, etc. (lookup codes if needed)
    translationType?:string  // First, New, Revision
}


// Short abbreviations for orgs that have many translations (matching eBible)
const org_abbreviations:Record<string, string> = {
    '545d2cb05f032bce5404dab8': 'wft',
    '545d2cb013cb53cafc2bad91': 'pbt',
    '545d2cb007eaee5131ab123a': 'ubs',
    '545d2cb00fd5dca263562474': 'bib',
    '545d2cb00be06579ca809b57': 'wbt',
    '54650d065117ad695d428986': 'seed',
    '019217aaaebdd5e7e372cf90': 'tlf',
}


export async function discover(existing:string[], discover_specific_id?:string):Promise<void>{
    // Discover translations that are available

    // Fetch all open-access text entries with full details
    const items = await fetch_all_entries()

    // Filter out non-text entries (if any slipped through)
    let filtered = items.filter(item => item.medium === 'text')

    // Filter out translations from eBible as better to get straight from eBible
    filtered = filtered.filter(item => item.providedByOrg?.name !== 'eBible.org')

    // Prepare to record stats for rest of tests
    const num_total = filtered.length
    let num_existing = 0
    let num_added = 0

    // Filter out ignored translations
    filtered = filtered.filter(item => !IGNORE.includes(item.uid))
    let num_ignored = num_total - filtered.length

    // Load language data
    const language_data = get_language_data()

    // Process each translation
    await concurrent(filtered.map(item => async () => {

        // Skip if only want to discover a single translation
        if (discover_specific_id && item.uid !== discover_specific_id){
            return
        }

        // Get org abbrev if any
        const org_uid = item.providedByOrg?.uid ?? ''
        const org_abbrev = org_abbreviations[org_uid]

        // Prepare english abbreviation first as may need to use for id
        const raw_lang = item.language?.isoCode ?? ''
        const lang_code = language_data.normalise(OUTDATED_LANG[raw_lang] ?? raw_lang)
        let eng_abbrev = (item.nameAbbreviation ?? '').toLowerCase().replace(/[^a-z]/gi, '')
        if (lang_code && eng_abbrev.includes(lang_code)){
            // Some translations include the language code in the abbreviation which isn't helpful
            eng_abbrev = eng_abbrev.replace(lang_code, '')
        }

        // Determine ids
        // NOTE Use org abbreviation when available (fallback on 'a' for later manual correction)
        let trans_id = `${lang_code ?? ''}_${org_abbrev || eng_abbrev || 'a'}`

        // Skip if already exists
        if (existing.includes(item.uid)){
            num_existing += 1
            return
        }

        // Ignore if invalid language
        if (!lang_code){
            console.error(`INVALID ${raw_lang} (unknown language)`)
            num_ignored += 1
            return
        }

        // Handle case when generated id already matches an existing translation
        let trans_dir = join('sources', 'bibles', trans_id)
        let meta_file = join(trans_dir, 'meta.json')
        if (existsSync(meta_file)){
            const existing_meta = read_json<TranslationSourceMeta>(meta_file)
            if (!existing_meta.ids.dbl){
                // Already added via another service so add dbl id to it
                existing_meta.ids.dbl = item.uid
                write_json(meta_file, existing_meta, true)
                num_existing += 1
                return
            } else {
                // Wants to have same id as another from DBL, so append abbrev to make more unique
                trans_id += '_' + eng_abbrev
                trans_dir = join('sources', 'bibles', trans_id)
                meta_file = join(trans_dir, 'meta.json')
            }
        }
        const log_ids = `${trans_id}/${item.uid}`

        // Detect the license from the copyright statement
        const copyright_html = item.copyrightStatement ?? ''
        let license:string|null = null
        const entry_url = `https://app.library.bible/content/${item.uid}`
        let license_url = entry_url

        // Get unique CC license types mentioned
        const cc_abbrev =
            new Set([...copyright_html.matchAll(/cc (by[a-z-]*)/ig)].map(r => r[1]!.toLowerCase()))

        // Determine what the license is
        if (/public domain/i.test(copyright_html) && !/not public domain/i.test(copyright_html)){
            license = 'public'
            if (copyright_html.includes('creativecommons.org/publicdomain/zero/1.0')){
                license_url = 'https://creativecommons.org/publicdomain/zero/1.0/'
            }
        } else if (cc_abbrev.size === 1){
            // Only auto-add if one license type (otherwise manually review which is best)
            const conditions = [...cc_abbrev.values()][0]!
            license = `cc-${conditions}`
            if (license in LICENSES){
                // NOTE DBL doesn't specify license version so 4.0 can only be assumed
                license_url = `https://creativecommons.org/licenses/${conditions}/4.0/`
            } else {
                console.warn(`Failed to detect CC license "${license}" (${log_ids})`)
                license = null
            }
        }

        // Work out earliest year of publication
        const date_submitted = parseInt((item.dateFirstSubmitted ?? '').slice(0, 4)) || 9999
        const date_finished = parseInt((item.dateTranslationFinished ?? '').slice(0, 4)) || 9999

        // Prepare the meta data
        const meta:TranslationSourceMeta = {
            name: {
                local: item.nameLocal ?? '',
                local_abbrev: item.nameAbbreviationLocal ?? '',
                english: item.name ?? '',
                english_abbrev: eng_abbrev.toUpperCase(),
            },
            year: Math.min(date_submitted, date_finished),
            direction: item.language?.scriptDirection?.toLowerCase() === 'rtl' ? 'rtl' : 'ltr',
            copyright: {
                licenses: license ? [{license, url: license_url}] : [],
                attribution: item.primaryLicensorOrg?.name || item.providedByOrg?.name || '',
                attribution_url: entry_url,
            },
            ids: {
                dbl: item.uid,
            },
            source: {
                service: 'dbl',
                format: 'usx',
                url: `${DBL_API}/content-entries/${item.uid}/zip`,
                updated: item.dateUpdated!.slice(0, 10),
                revision: item.revision!,
            },
            tags: [],
        }

        // Save meta file
        mkdirSync(trans_dir, {recursive: true})
        write_json(meta_file, meta, true)
        num_added += 1
        existing.push(item.uid)
    }))

    // Report stats
    console.info(`DBL new: ${num_added}`)
    console.info(`DBL existing: ${num_existing}`)
    console.info(`DBL ignored: ${num_ignored}`)
    console.info(`DBL total: ${num_total}`)
}


// Fetch all open-access text entries, paginating through results
async function fetch_all_entries():Promise<ContentEntryDetailed[]> {
    const all_items:ContentEntry[] = []
    const limit = 500
    let offset = 0

    while (true) {
        // Build the request URL with filters
        const url = `${DBL_API}/content-entries?is_open_access=true&medium=text`
            + `&include_full_details=true&limit=${limit}&offset=${offset}`
        const headers = dbl_headers(url)
        const resp = await request<ListContentEntriesResponse>(url, 'json', headers)
        all_items.push(...resp.items)

        // Fewer items than requested means this was the last page
        if (resp.items.length < limit){
            break
        }
        offset += limit
    }

    return all_items
}
