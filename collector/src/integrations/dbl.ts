
import {join} from 'node:path'
import {existsSync, mkdirSync} from 'node:fs'
import {createHmac} from 'node:crypto'

import {z} from 'zod'

import {request_json, concurrent, read_json} from '../parts/utils.js'
import {translation_source_meta, write_translation_meta} from '../parts/schemas.js'
import {license_from_text} from '../parts/license.js'
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
    '3ea0147e32eebe47',  // Older version of 3847624917e94649 (mal_irv)
    '8dcc89916a0bcd59',  // Included as second zip (OT) for ndj_wft
    '1c18e3bbb2704a35',  // Included as second zip (some OT) for sch_wft
    'e6da7cdb23e18a0d',  // Included as second zip (OT) for ziw_wft
    '324f457845cb5d21',  // NT already contained in OT+NT ace2eca02cc539c3
    '355792a03079ccdd',  // NT already contained in OT+NT 4ae38a8d32ca9871
    '857a0682a982b1a4',  // Spanish glosses for Hebrew OT (study material, not a translation)
    '7739f4357a197e5b',  // kgj Gamal Kham: WBT display-only license (all rights reserved)
    '1021d5b32c474ae5',  // rki Northern Rakhine Mark: zip's usx is empty (0 bytes)
    '57d174d29b534364',  // rki Southern Rakhine Mark: zip's usx is empty (0 bytes)
    // African International NT (Word Biblical Ministries, 2026): dropped for poor source markup —
    // chapter-end footnote paras leak into verse text, verse markers missing/mislabelled, thousands
    // of stray '*' markers. Text itself is decent, so reconsider if a cleaner revision is uploaded.
    'e368831dd78a4451',  // eng_aila (Literal, American)
    'b2a377edb4454c0e',  // eng_ailb (Literal, British)
    'dc26e2222f1b4f0c',  // eng_aipa (Paraphrase, American)
    '55933bbd04844303',  // eng_aipb (Paraphrase, British)
]

// Some language codes are outdated
const OUTDATED_LANG:Record<string, string> = {cug: 'cnq', plj: 'zlu'}



// DBL API response schemas (only the fields used; unknown fields are stripped)
// NOTE Optional fields use nullish() as the API returns null for unset values in places
const dbl_datetime = z.string().regex(/^\d{4}-\d{2}-\d{2}T/, "Expected an ISO 8601 datetime")
const dbl_year_or_date = z.string().regex(/^\d{4}(-\d{2}-\d{2})?$/, "Expected yyyy or yyyy-mm-dd")
const dbl_org = z.object({uid: z.string(), name: z.string()})

// One content entry from the list endpoint (with include_full_details=true)
const dbl_content_entry = z.object({
    uid: z.string().regex(/^[0-9a-f]{16}$/, "Expected a 16 char hex uid"),
    name: z.string(),
    medium: z.string().nullish(),
    language: z.object({
        isoCode: z.string().nullish(),
        scriptDirection: z.enum(['LTR', 'RTL']).nullish(),
    }).nullish(),
    providedByOrg: dbl_org.nullish(),
    primaryLicensorOrg: dbl_org.nullish(),
    copyrightStatement: z.string().nullish(),
    dateFirstSubmitted: dbl_datetime.nullish(),
    dateUpdated: dbl_datetime,
    dateTranslationFinished: dbl_year_or_date.nullish(),  // Sometimes just a year
    nameLocal: z.string().nullish(),
    nameAbbreviation: z.string().nullish(),
    nameAbbreviationLocal: z.string().nullish(),
    revision: z.number().int().nonnegative(),
})
type DblContentEntry = z.infer<typeof dbl_content_entry>

// List endpoint envelope (entries validated individually so one bad entry doesn't block the rest)
const dbl_list_response = z.object({items: z.array(z.unknown())})

const dbl_agreements_response = z.object({
    items: z.array(z.object({licenseTemplateRevisionID: z.number().int().positive().nullish()})),
})

const dbl_template_revision = z.object({
    externalURL: z.string().nullish(),
    summary: z.string().nullish(),
    licenseText: z.string().nullish(),
})

// The zip endpoint returns a short-lived download link rather than the zip itself
const dbl_zip_response = z.object({presignedURL: z.url()})


// Resolve a DBL zip endpoint url to the presigned url the zip can actually be downloaded from
export async function dbl_zip_download_url(url:string):Promise<string>{
    return (await request_json(url, dbl_zip_response, dbl_headers(url))).presignedURL
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

    // Track ids claimed during this run, as concurrent items may not have written their meta yet
    const claimed_ids = new Set<string>()

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
        if (existsSync(meta_file) || claimed_ids.has(trans_id)){
            const existing_meta = existsSync(meta_file)
                ? read_json(meta_file, translation_source_meta) : null
            if (existing_meta && !existing_meta.ids.dbl){
                // Already added via another service so add dbl id to it
                existing_meta.ids.dbl = item.uid
                write_translation_meta(meta_file, existing_meta)
                num_existing += 1
                return
            } else {
                // Wants to have same id as another from DBL, so append abbrev to make more unique
                trans_id += '_' + eng_abbrev
                trans_dir = join('sources', 'bibles', trans_id)
                meta_file = join(trans_dir, 'meta.json')
            }
        }
        claimed_ids.add(trans_id)

        // Detect the license from the copyright statement
        const copyright_html = item.copyrightStatement ?? ''
        let license:string|null = null
        const entry_url = `https://app.library.bible/content/${item.uid}`
        let license_url = entry_url

        // Try URL and public domain text detection on the copyright statement
        const text_detected = license_from_text(copyright_html)
        if (text_detected){
            license = text_detected.license
            if (text_detected.url)
                license_url = text_detected.url
        }

        // Fallback: look up license via the license agreements and template revision APIs
        if (!license){
            const template_license = await fetch_license_from_template(item.uid)
            if (template_license){
                license = template_license.license
                license_url = template_license.url
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
                updated: item.dateUpdated.slice(0, 10),
                revision: item.revision,
            },
            tags: [],
        }

        // Save meta file
        mkdirSync(trans_dir, {recursive: true})
        write_translation_meta(meta_file, meta)
        num_added += 1
        existing.push(item.uid)
    }))

    // Report stats
    console.info(`DBL new: ${num_added}`)
    console.info(`DBL existing: ${num_existing}`)
    console.info(`DBL ignored: ${num_ignored}`)
    console.info(`DBL total: ${num_total}`)
}


// Known licenses for template revisions that are inaccessible via the API
// NOTE Looked up manually via the DBL website when API returns 404 due to faulty permissions config
const KNOWN_TEMPLATE_LICENSES:Record<number, {license:string, url:string}> = {
    2162: {license: 'cc-by-sa', url: 'https://creativecommons.org/licenses/by-sa/4.0/'},
    2486: {license: 'cc-by-sa', url: 'https://creativecommons.org/licenses/by-sa/4.0/'},
}

// Cache template revision results to avoid re-fetching for the same template
const template_revision_cache = new Map<number, Promise<{license:string, url:string}|null>>()


// Fetch license info by looking up the entry's license agreement and then the template revision
async function fetch_license_from_template(
        entry_uid:string):Promise<{license:string, url:string}|null> {

    // Get the license agreement for this entry
    const agreements_url = `${DBL_API}/license-agreements?content_entry_uid=${entry_uid}`
    const agreements = await request_json(
        agreements_url, dbl_agreements_response, dbl_headers(agreements_url))
    const revision_id = agreements.items[0]?.licenseTemplateRevisionID
    if (!revision_id){
        return null
    }

    // Use cached promise if already fetched for this template revision
    if (!template_revision_cache.has(revision_id)){
        template_revision_cache.set(revision_id, (async () => {
            const template_url = `${DBL_API}/license-template-revisions/${revision_id}`
            let template:z.infer<typeof dbl_template_revision>
            try {
                template = await request_json(
                    template_url, dbl_template_revision, dbl_headers(template_url))
            } catch {
                // Revision not accessible to our org — check hardcoded fallbacks first
                const known = KNOWN_TEMPLATE_LICENSES[revision_id]
                if (known){
                    return known
                }
                throw new Error(`License template revision ${revision_id} not accessible via API.`
                    + ` Look up the license at https://app.library.bible/content/${entry_uid}`
                    + ` and add it to KNOWN_TEMPLATE_LICENSES in dbl.ts`)
            }
            // Some templates store the CC URL in summary/licenseText rather than externalURL
            const text_to_check = template.externalURL
                || template.summary || template.licenseText || ''
            return license_from_text(text_to_check)
        })())
    }

    return template_revision_cache.get(revision_id)!
}


// Fetch all open-access text entries, paginating through results
async function fetch_all_entries():Promise<DblContentEntry[]> {
    const all_items:DblContentEntry[] = []
    const limit = 500
    let offset = 0

    while (true) {
        // Build the request URL with filters
        const url = `${DBL_API}/content-entries?is_open_access=true&medium=text`
            + `&include_full_details=true&limit=${limit}&offset=${offset}`
        const resp = await request_json(url, dbl_list_response, dbl_headers(url))

        // Validate each entry, reporting and skipping any that don't match what we rely on
        for (const [index, raw] of resp.items.entries()){
            const entry = dbl_content_entry.safeParse(raw)
            if (entry.success){
                all_items.push(entry.data)
            } else {
                const uid = z.object({uid: z.string()}).safeParse(raw).data?.uid ?? `#${offset + index}`
                console.error(`INVALID DBL entry ${uid} (skipped):\n${z.prettifyError(entry.error)}`)
            }
        }

        // Fewer items than requested means this was the last page
        if (resp.items.length < limit){
            break
        }
        offset += limit
    }

    return all_items
}


// Get the latest available version of each DBL translation, keyed by DBL uid
// NOTE Used by download to detect when a source has been updated since last downloaded
export async function get_remote_versions()
        :Promise<Map<string, {updated:string, revision:number}>>{
    const versions = new Map<string, {updated:string, revision:number}>()
    for (const item of await fetch_all_entries()){
        versions.set(item.uid, {
            updated: item.dateUpdated.slice(0, 10),
            revision: item.revision,
        })
    }
    return versions
}
