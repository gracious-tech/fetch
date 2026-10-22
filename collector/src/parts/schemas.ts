
// Runtime schemas for data the collector reads (files on disk and generated dist data)
//
// External data is never trusted: every JSON read goes through one of these schemas (see
// read_json/request_json in utils.ts). Each schema is asserted at compile time to infer exactly
// the TS interface it mirrors, so the two can't drift apart. Our own files use strict objects so a
// typo'd or unexpected key is rejected rather than silently dropped when the file is rewritten.
// Schemas for third-party responses live beside the integration that requests them.

import {z} from 'zod'

import {validate, write_json} from './utils.js'

import type {BibleJsonTxt, BookNames, BookSection, DistManifest, DistManifestItem,
    DistSectionData, DistTranslationExtra, MetaCopyright, MetaLanguage, MetaRestrictions,
    MetaStandardLicense, MetaTag, MetaTranslationName, SectionStat} from './shared_types'
import type {CollectionConfig, GlossesSourceMeta, NotesSourceMeta, TranslationSourceMeta}
    from './types'


// Compile-time check that a schema's inferred type is exactly the given interface
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true : false
// No-op at runtime; only exists so a mismatch fails type checking
const assert_type = <T extends true>():T|undefined => undefined


// Reusable primitives
export const non_empty = z.string().min(1)
export const lang_code = z.string().regex(/^[a-z]{3}$/, "Expected a 3 letter language code")
export const book_code = z.string().regex(/^[0-9a-z]{3}$/, "Expected a 3 char book code")
export const script_code = z.string().regex(/^[A-Z][a-z]{3}$/, "Expected an ISO 15924 script")
export const region_code = z.string().regex(/^[A-Z]{2}$/, "Expected an ISO 3166-1 region")
export const iso_date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a yyyy-mm-dd date")
export const direction = z.enum(['ltr', 'rtl'])
const positive_int = z.number().int().positive()


export const meta_tag = z.enum(['recommended', 'archaic', 'questionable', 'niche', 'literal1',
    'literal2', 'literal3', 'literal4', 'literal5'])
assert_type<Equals<z.infer<typeof meta_tag>, MetaTag>>()


export const meta_translation_name = z.strictObject({
    local: z.string(),
    local_abbrev: z.string(),
    english: z.string(),
    english_abbrev: z.string(),
})
assert_type<Equals<z.infer<typeof meta_translation_name>, MetaTranslationName>>()


export const meta_restrictions = z.strictObject({
    forbid_limitless: z.boolean(),
    forbid_commercial: z.boolean(),
    forbid_derivatives: z.union([z.boolean(), z.literal('same-license')]),
    forbid_attributionless: z.boolean(),
    forbid_other: z.boolean(),
})
assert_type<Equals<z.infer<typeof meta_restrictions>, MetaRestrictions>>()


export const meta_standard_license = z.strictObject({
    name: non_empty,
    restrictions: meta_restrictions,
})
assert_type<Equals<z.infer<typeof meta_standard_license>, MetaStandardLicense>>()


export const meta_copyright = z.strictObject({
    attribution: z.string(),
    attribution_url: z.string(),
    licenses: z.array(z.strictObject({
        license: z.union([non_empty, meta_restrictions]),
        url: z.string(),
    })),
})
assert_type<Equals<z.infer<typeof meta_copyright>, MetaCopyright>>()


export const meta_language = z.strictObject({
    local: non_empty,
    english: non_empty,
    pop: z.number().int().nonnegative().nullable(),
    direction,
})
assert_type<Equals<z.infer<typeof meta_language>, MetaLanguage>>()


// Fields common to every resource's sources/<category>/**/meta.json
const common_meta_fields = {
    name: meta_translation_name,
    year: z.number().int().nullable(),
    direction,
    copyright: meta_copyright,
    tags: z.array(meta_tag),
    notes: z.exactOptional(z.string()),
    partial: z.exactOptional(z.array(book_code)),
    script: z.exactOptional(script_code),
    region: z.exactOptional(region_code),
}
const common_source_fields = {
    updated: z.string(),
    revision: z.number().nonnegative(),  // NOTE May be a release number like 1.25
    url: z.union([non_empty, z.array(non_empty).min(1), z.null()]),
}


// sources/bibles/*/meta.json
export const translation_source_meta = z.strictObject({
    ...common_meta_fields,
    ids: z.strictObject({
        ebible: z.exactOptional(non_empty),
        dbl: z.exactOptional(non_empty),
        door43: z.exactOptional(non_empty),
    }),
    source: z.strictObject({
        ...common_source_fields,
        service: z.enum(['ebible', 'dbl', 'door43', 'manual']),
        format: z.enum(['usx', 'usfm']),
    }),
})
assert_type<Equals<z.infer<typeof translation_source_meta>, TranslationSourceMeta>>()


// sources/glosses/*/*/meta.json
export const glosses_source_meta = z.strictObject({
    ...common_meta_fields,
    ids: z.strictObject({gbt: z.exactOptional(non_empty)}),
    source: z.strictObject({
        ...common_source_fields,
        service: z.enum(['gbt', 'manual']),
        format: z.null(),
    }),
})
assert_type<Equals<z.infer<typeof glosses_source_meta>, GlossesSourceMeta>>()


// sources/notes/*/*/meta.json
export const notes_source_meta = z.strictObject({
    ...common_meta_fields,
    ids: z.strictObject({}),
    source: z.strictObject({
        ...common_source_fields,
        service: z.literal('manual'),
        format: z.null(),
    }),
})
// NOTE ids excluded: zod infers Record<string, never> for the interface's {} (both empty)
assert_type<Equals<Omit<z.infer<typeof notes_source_meta>, 'ids'>, Omit<NotesSourceMeta, 'ids'>>>()


// Write a translation's meta.json, validating it first (it's often built from external data)
export function write_translation_meta(path:string, meta:TranslationSourceMeta){
    write_json(path, validate(meta, translation_source_meta, path), true)
}


// config.yaml
export const collection_config = z.strictObject({
    integrations: z.strictObject({
        aws: z.strictObject({
            bucket: non_empty,
            region: non_empty,
            cloudfront: non_empty,
        }),
    }),
})
assert_type<Equals<z.infer<typeof collection_config>, CollectionConfig>>()


// sources/languages.json
export const language_data = z.strictObject({
    languages: z.record(lang_code, meta_language),
    language2to3: z.record(z.string().regex(/^[a-z]{2}$/), lang_code),
    macro_to_individual: z.record(lang_code, lang_code),
})


// DIST


export const book_names = z.strictObject({
    normal: z.string(),
    long: z.string(),
    abbrev: z.string(),
})
assert_type<Equals<z.infer<typeof book_names>, BookNames>>()


// dist/bibles/*/txt/*.json
export const bible_json_txt = z.strictObject({
    book: book_code,
    name: book_names,
    contents: z.array(z.array(z.array(z.union([
        z.string(),
        z.strictObject({type: z.literal('heading'), contents: z.string(),
            level: z.union([z.literal(1), z.literal(2), z.literal(3)])}),
        z.strictObject({type: z.literal('note'), contents: z.string()}),
    ])))),
})
assert_type<Equals<z.infer<typeof bible_json_txt>, BibleJsonTxt>>()


const verse_range = {
    start_chapter: positive_int,
    start_verse: positive_int,
    end_chapter: positive_int,
    end_verse: positive_int,
}


export const book_section = z.strictObject({
    ...verse_range,
    heading: z.string().nullable(),
})
assert_type<Equals<z.infer<typeof book_section>, BookSection>>()


// dist/bibles/*/extra.json
export const dist_translation_extra = z.strictObject({
    book_names: z.record(book_code, book_names),
    chapter_headings: z.record(book_code, z.array(z.string())),
    sections: z.record(book_code, z.array(book_section)),
    wj_markup: z.boolean(),
})
assert_type<Equals<z.infer<typeof dist_translation_extra>, DistTranslationExtra>>()


const score = z.number().int().min(1).max(5)
export const section_stat = z.strictObject({
    ...verse_range,
    importance: score,
    popularity: score,
    reason: z.exactOptional(z.string()),
})
assert_type<Equals<z.infer<typeof section_stat>, SectionStat>>()


// sections.json
export const dist_section_data = z.strictObject({
    model: non_empty,
    generated: z.string(),
    sections: z.record(book_code, z.array(section_stat)),
})
assert_type<Equals<z.infer<typeof dist_section_data>, DistSectionData>>()


export const dist_manifest_item = z.strictObject({
    name: meta_translation_name,
    year: z.number().int(),
    books_ot: z.union([z.literal(true), z.array(book_code)]),
    books_nt: z.union([z.literal(true), z.array(book_code)]),
    copyright: meta_copyright,
    direction,
    tags: z.array(meta_tag),
    partial: z.exactOptional(z.array(book_code)),
    script: z.exactOptional(script_code),
    region: z.exactOptional(region_code),
})
assert_type<Equals<z.infer<typeof dist_manifest_item>, DistManifestItem>>()


// dist/manifest.json
export const dist_manifest = z.strictObject({
    bibles: z.record(non_empty, dist_manifest_item),
    glosses: z.record(non_empty, dist_manifest_item),
    notes: z.record(non_empty, dist_manifest_item),
    languages: z.record(lang_code, meta_language),
    language2to3: z.record(z.string().regex(/^[a-z]{2}$/), lang_code),
    languages_most_spoken: z.array(lang_code),
    books_ordered: z.array(book_code),
    book_names_english: z.record(book_code, non_empty),
    licenses: z.record(non_empty, meta_standard_license),
})
assert_type<Equals<z.infer<typeof dist_manifest>, DistManifest>>()


// Validate a manifest's structure and cross-references (what clients rely on) before it's used
// NOTE Collects every problem so one run reveals them all, then throws if there were any
export function validate_manifest(data:unknown, source:string):DistManifest{
    const manifest = validate(data, dist_manifest, source)
    const problems:string[] = []
    const book_set = new Set(manifest.books_ordered)
    for (const category of ['bibles', 'glosses', 'notes'] as const){
        for (const [id, item] of Object.entries(manifest[category])){
            const label = `${category}/${id}`

            // Clients derive the language from the id and expect its names to exist
            if (!(id.slice(0, 3) in manifest.languages)){
                problems.push(`${label}: language "${id.slice(0, 3)}" missing from languages`)
            }

            // Must have something to display as a name and abbreviation
            if (!item.name.local && !item.name.english){
                problems.push(`${label}: no name`)
            }
            if (!item.name.local_abbrev && !item.name.english_abbrev){
                problems.push(`${label}: no abbreviation`)
            }

            // Must have at least one book, and only known ones
            const books = [item.books_ot, item.books_nt].flatMap(list => list === true ? [] : list)
            if (item.books_ot !== true && item.books_nt !== true && !books.length){
                problems.push(`${label}: no books`)
            }
            for (const book of [...books, ...item.partial ?? []]){
                if (!book_set.has(book)){
                    problems.push(`${label}: unknown book "${book}"`)
                }
            }

            // Standard licenses must be defined in the manifest so clients can describe them
            if (!item.copyright.licenses.length){
                problems.push(`${label}: no licenses`)
            }
            for (const {license} of item.copyright.licenses){
                if (typeof license === 'string' && !(license in manifest.licenses)){
                    problems.push(`${label}: unknown license "${license}"`)
                }
            }
        }
    }
    if (problems.length){
        throw new Error(`Invalid manifest from ${source}:\n${problems.join('\n')}`)
    }
    return manifest
}
