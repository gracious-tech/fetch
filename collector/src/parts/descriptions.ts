
import {existsSync, readFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'

import {dist_descriptions, translation_source_meta} from './schemas.js'
import {list_files, mkdir_exist, read_json, validate, write_json} from './utils.js'
import {add_unpublished} from './unpublished.js'

import type {DistDescription} from './shared_types'
import type {TranslationSourceMeta} from './types'


// Description files by language code then translation id (only translations with something to say)
type DescriptionsByLanguage = Record<string, Record<string, DistDescription>>

// Where Bible descriptions are published (other resource types can get their own dir later)
const BIBLES_DIR = join('dist', 'descriptions', 'bibles')


// Group the description text of translations into one set of entries per language
export function build_descriptions(metas:Record<string, TranslationSourceMeta>)
        :DescriptionsByLanguage{
    const by_language:DescriptionsByLanguage = {}
    for (const id of Object.keys(metas).sort()){
        const meta = metas[id]!

        // Only include the parts that are present
        const entry:DistDescription = {
            ...(meta.description ? {english: meta.description} : {}),
            ...(meta.description_local ? {local: meta.description_local} : {}),
            ...(meta.provenance ? {provenance: meta.provenance} : {}),
        }
        if (!Object.keys(entry).length){
            continue
        }

        // Translation ids are prefixed with their language code
        const language = id.slice(0, 3)
        by_language[language] = {...by_language[language], [id]: entry}
    }
    return by_language
}


// Write description files for the given translation ids, flagging them to be published if changed
export function update_descriptions(ids:string[]):void{
    console.info("Generating descriptions...")

    // Load the meta of every translation that is in the manifest
    const metas:Record<string, TranslationSourceMeta> = {}
    for (const id of ids){
        metas[id] = read_json(join('sources', 'bibles', id, 'meta.json'), translation_source_meta)
    }

    // Write each language's file, noting whether anything differs from what is already there
    mkdir_exist(BIBLES_DIR)
    let changed = false
    const by_language = build_descriptions(metas)
    for (const [language, entries] of Object.entries(by_language)){
        const path = join(BIBLES_DIR, `${language}.json`)
        const previous = existsSync(path) ? readFileSync(path, 'utf-8') : null
        write_json(path, validate(entries, dist_descriptions, path))
        changed ||= previous !== readFileSync(path, 'utf-8')
    }

    // Remove files for languages that no longer have any descriptions
    for (const name of list_files(BIBLES_DIR)){
        if (!(name.slice(0, -'.json'.length) in by_language)){
            rmSync(join(BIBLES_DIR, name))
            changed = true
        }
    }

    if (changed){
        add_unpublished(['descriptions/bibles'])
    }
}
