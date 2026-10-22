
// Defensive checks for manifests fetched at runtime
//
// The collector validates manifests before publishing, but a client may combine collections from
// other endpoints, meet a newer/older manifest format, or be served a stale cached copy. So rather
// than trust the JSON blindly, keep only entries with the fields the client relies on (repairing
// trivially fixable ones) and warn about the rest, so one bad entry can't break the whole client.

import {books_ordered} from '@gracious.tech/bible-references'

import type {DistManifest, DistManifestItem, MetaCopyright, MetaLanguage, MetaRestrictions,
    MetaStandardLicense, MetaTag, MetaTranslationName} from './shared_types.js'


// Small type guards for parsed JSON
type Obj = Record<string, unknown>
const is_obj = (value:unknown):value is Obj =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
const is_str = (value:unknown):value is string => typeof value === 'string'
const str_or = (value:unknown, fallback:string):string => is_str(value) ? value : fallback
const book_set = new Set(books_ordered)
const known_tags:readonly string[] = ['recommended', 'archaic', 'questionable', 'niche',
    'literal1', 'literal2', 'literal3', 'literal4', 'literal5'] satisfies MetaTag[]
const is_tag = (value:string):value is MetaTag => known_tags.includes(value)


// @internal Return a manifest containing only valid entries, warning about any that were dropped
export function sanitize_manifest(raw:unknown, source:string):DistManifest{

    // Nothing usable if not even an object
    if (!is_obj(raw)){
        throw new Error(`Manifest from ${source} is not a JSON object`)
    }
    const problems:string[] = []

    // Licenses first, as resources are only kept if they have a usable license
    const licenses:Record<string, MetaStandardLicense> = {}
    for (const [id, value] of entries(raw['licenses'])){
        const restrictions = is_obj(value) ? sanitize_restrictions(value['restrictions']) : null
        if (is_obj(value) && is_str(value['name']) && restrictions){
            licenses[id] = {name: value['name'], restrictions}
        } else {
            problems.push(`licenses/${id}`)
        }
    }

    // Languages (a missing local or English name falls back to the other)
    const languages:Record<string, MetaLanguage> = {}
    for (const [code, value] of entries(raw['languages'])){
        const language = sanitize_language(value)
        if (language){
            languages[code] = language
        } else {
            problems.push(`languages/${code}`)
        }
    }

    // Resources of each type (dropping any whose language is unknown)
    const resources = {} as Record<'bibles'|'glosses'|'notes', Record<string, DistManifestItem>>
    for (const type of ['bibles', 'glosses', 'notes'] as const){
        resources[type] = {}
        for (const [id, value] of entries(raw[type])){
            const item = id.slice(0, 3) in languages ? sanitize_item(value, licenses) : null
            if (item){
                resources[type][id] = item
            } else {
                problems.push(`${type}/${id}`)
            }
        }
    }

    // Report what was ignored (in one message to avoid flooding the console)
    if (problems.length){
        console.warn(`fetch(bible): ignored ${problems.length} invalid manifest entries from `
            + `${source}: ${problems.slice(0, 10).join(', ')}${problems.length > 10 ? '…' : ''}`)
    }

    return {
        ...resources,
        languages,
        language2to3: Object.fromEntries(entries(raw['language2to3'])
            .filter((entry):entry is [string, string] => is_str(entry[1]))),
        languages_most_spoken: string_array(raw['languages_most_spoken']),
        books_ordered: [...books_ordered],
        book_names_english: Object.fromEntries(entries(raw['book_names_english'])
            .filter((entry):entry is [string, string] => is_str(entry[1]))),
        licenses,
    }
}


// Entries of a JSON object (none if not an object)
function entries(value:unknown):[string, unknown][]{
    return is_obj(value) ? Object.entries(value) : []
}


// Only the strings of a JSON array (none if not an array)
function string_array(value:unknown):string[]{
    return Array.isArray(value) ? value.filter(is_str) : []
}


// A language with at least one name (else null)
function sanitize_language(value:unknown):MetaLanguage|null{
    if (!is_obj(value)){
        return null
    }
    const local = str_or(value['local'], '') || str_or(value['english'], '')
    const english = str_or(value['english'], '') || local
    if (!local){
        return null
    }
    return {
        local,
        english,
        pop: typeof value['pop'] === 'number' ? value['pop'] : null,
        direction: value['direction'] === 'rtl' ? 'rtl' : 'ltr',
    }
}


// License restrictions if every condition is present (else null, as defaults could be unsafe)
function sanitize_restrictions(value:unknown):MetaRestrictions|null{
    if (!is_obj(value)){
        return null
    }
    const flag = (key:string) => {
        const flag_value = value[key]
        return typeof flag_value === 'boolean' ? flag_value : null
    }
    const limitless = flag('forbid_limitless')
    const commercial = flag('forbid_commercial')
    const attributionless = flag('forbid_attributionless')
    const other = flag('forbid_other')
    const derivatives = value['forbid_derivatives'] === 'same-license' ? 'same-license'
        : flag('forbid_derivatives')
    if (limitless === null || commercial === null || attributionless === null || other === null
            || derivatives === null){
        return null
    }
    return {
        forbid_limitless: limitless,
        forbid_commercial: commercial,
        forbid_derivatives: derivatives,
        forbid_attributionless: attributionless,
        forbid_other: other,
    }
}


// A resource with a name, year, books and at least one usable license (else null)
function sanitize_item(value:unknown, licenses:Record<string, MetaStandardLicense>)
        :DistManifestItem|null{
    if (!is_obj(value) || !is_obj(value['name']) || !is_obj(value['copyright'])
            || typeof value['year'] !== 'number'){
        return null
    }

    // Name must have something to display
    const raw_name = value['name']
    const name:MetaTranslationName = {
        local: str_or(raw_name['local'], ''),
        local_abbrev: str_or(raw_name['local_abbrev'], ''),
        english: str_or(raw_name['english'], ''),
        english_abbrev: str_or(raw_name['english_abbrev'], ''),
    }
    if (!name.local && !name.english){
        return null
    }

    // Books may be `true` (whole testament) or a list (unknown book codes are dropped)
    const books = (books:unknown) => books === true ? true as const
        : string_array(books).filter(book => book_set.has(book))
    const books_ot = books(value['books_ot'])
    const books_nt = books(value['books_nt'])
    if (books_ot !== true && books_nt !== true && !books_ot.length && !books_nt.length){
        return null
    }

    // Keep only licenses that are standard ones we know or fully specified custom ones
    const raw_copyright = value['copyright']
    const item_licenses:MetaCopyright['licenses'] = []
    const raw_licenses = Array.isArray(raw_copyright['licenses']) ? raw_copyright['licenses'] : []
    for (const license of raw_licenses){
        if (!is_obj(license) || !is_str(license['url'])){
            continue
        }
        const id_or_custom = license['license']
        if (is_str(id_or_custom) && id_or_custom in licenses){
            item_licenses.push({license: id_or_custom, url: license['url']})
        } else {
            const custom = sanitize_restrictions(id_or_custom)
            if (custom){
                item_licenses.push({license: custom, url: license['url']})
            }
        }
    }
    if (!item_licenses.length){
        return null
    }

    // Assemble, only including optional fields when valid
    const item:DistManifestItem = {
        name,
        year: value['year'],
        books_ot,
        books_nt,
        copyright: {
            attribution: str_or(raw_copyright['attribution'], ''),
            attribution_url: str_or(raw_copyright['attribution_url'], ''),
            licenses: item_licenses,
        },
        direction: value['direction'] === 'rtl' ? 'rtl' : 'ltr',
        tags: string_array(value['tags']).filter(is_tag),
    }
    const partial = string_array(value['partial']).filter(book => book_set.has(book))
    if (partial.length){
        item.partial = partial
    }
    if (is_str(value['script'])){
        item.script = value['script']
    }
    if (is_str(value['region'])){
        item.region = value['region']
    }
    return item
}
