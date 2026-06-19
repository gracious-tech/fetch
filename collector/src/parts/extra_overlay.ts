
import {join} from 'node:path'
import {existsSync} from 'node:fs'

import {build_native_book_extra} from './sections.js'
import {read_json, write_json, list_files, list_dirs} from './utils.js'

import type {TranslationSourceMeta} from './types.js'
import type {BibleJsonTxt, DistTranslationExtra} from './shared_types.js'


// Build the native (own-source only) extra data for a translation by reading its txt dist files
function _build_native_extra(dist_dir:string):DistTranslationExtra{
    const extra:DistTranslationExtra = {book_names: {}, chapter_headings: {}, sections: {}}
    const txt_dir = join(dist_dir, 'txt')
    if (!existsSync(txt_dir)){
        return extra
    }
    // Mirror process.ts: build each book's native extra from its txt JSON
    for (const filename of list_files(txt_dir)){
        const book = filename.split('.')[0]!
        const json_txt = read_json<BibleJsonTxt>(join(txt_dir, filename))
        const book_extra = build_native_book_extra(json_txt)
        extra.book_names[book] = book_extra.name
        extra.sections[book] = book_extra.sections
        extra.chapter_headings[book] = book_extra.chapter_headings
    }
    return extra
}


export function build_extra_overlay(){
    // Fill each translation's missing extra.json data from same-language sibling translations
    // NOTE Donor data is always the freshly-recomputed native extra (never on-disk extra.json), so
    // repeat runs are idempotent and borrowed data is never re-borrowed by a third translation

    const bibles_dist = join('dist', 'bibles')
    if (!existsSync(bibles_dist)){
        return
    }
    const ids = list_dirs(bibles_dist)

    // Build native extra and load source meta for every translation up front
    const natives:Record<string, DistTranslationExtra> = {}
    const metas:Record<string, TranslationSourceMeta> = {}
    for (const id of ids){
        natives[id] = _build_native_extra(join(bibles_dist, id))
        const meta_path = join('sources', 'bibles', id, 'meta.json')
        if (existsSync(meta_path)){
            metas[id] = read_json<TranslationSourceMeta>(meta_path)
        }
    }

    // Track how much was actually borrowed (so the summary reflects reality)
    let filled_name_fields = 0
    let filled_heading_books = 0
    const affected_translations = new Set<string>()

    // Fill each translation's gaps from its same-language donors
    for (const id of ids){
        const native = natives[id]!
        const lang = id.slice(0, 3)

        // Order same-language donors: those tagged 'recommended' first, then most recent year
        const donors = ids.filter(other => other !== id && other.slice(0, 3) === lang)
        donors.sort((a, b) => {
            const a_rec = metas[a]?.tags.includes('recommended') ? 1 : 0
            const b_rec = metas[b]?.tags.includes('recommended') ? 1 : 0
            if (a_rec !== b_rec){
                return b_rec - a_rec
            }
            return (metas[b]?.year ?? 0) - (metas[a]?.year ?? 0)
        })

        // Start from native data and overlay any borrowed data
        const final:DistTranslationExtra = structuredClone(native)

        // Consider every book this translation actually has
        for (const book of Object.keys(native.book_names)){

            // Borrow each book name field independently from the best donor that has it
            // (e.g. fill a missing abbrev even when normal is present, possibly from a different
            // donor than the one supplying another field)
            for (const field of ['normal', 'long', 'abbrev'] as const){
                if (native.book_names[book]![field]){
                    continue
                }
                for (const donor of donors){
                    const donor_value = natives[donor]!.book_names[book]?.[field]
                    if (donor_value){
                        final.book_names[book]![field] = donor_value
                        filled_name_fields += 1
                        affected_translations.add(id)
                        break
                    }
                }
            }

            // Borrow headings (sections + chapter_headings together) if book has no real sections
            // NOTE Both come from the same donor so the client's null-heading merge stays valid
            if (!native.sections[book]!.length){
                for (const donor of donors){
                    const donor_sections = natives[donor]!.sections[book]
                    if (donor_sections?.length){
                        final.sections[book] = structuredClone(donor_sections)
                        final.chapter_headings[book] =
                            structuredClone(natives[donor]!.chapter_headings[book]!)
                        filled_heading_books += 1
                        affected_translations.add(id)
                        break
                    }
                }
            }
        }

        // Write the merged extra file (byte-identical to native when nothing was borrowed)
        write_json(join(bibles_dist, id, 'extra.json'), final)
    }

    // Report what was actually borrowed (may be nothing if no translation needed a sibling)
    console.info(`Filled ${filled_name_fields} book name field(s) and ${filled_heading_books} `
        + `book heading set(s) across ${affected_translations.size} translation(s) from siblings`)
}
