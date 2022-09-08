
import {join} from 'path'
import {existsSync, readdirSync, writeFileSync} from 'fs'

import {isEqual} from 'lodash-es'

import {book_names_english, books_ordered, last_verse} from './bible.js'
import {get_language_data} from './languages.js'
import {LICENSES} from './license.js'
import {read_json} from './utils.js'
import type {DistManifest} from './shared_types'
import type {BookExtracts, TranslationSourceMeta} from './types'
import {_missing_meta} from './reporting.js'


export async function update_manifest(){
    // Generate the manifest for the collection and save to file
    // NOTE This only considers translations already output to dist dir
    console.info("Generating manifest...")

    const manifest:DistManifest = {
        translations: {},
        languages: {},
        language2to3: {},
        books_ordered,
        book_names_english,
        last_verse,
        licenses: LICENSES,
    }

    // Keep track of what languages are included
    const included_languages:Set<string> = new Set()

    // Loop through published translations in dist dir
    for (const trans of readdirSync(join('dist', 'bibles'))){

        if (trans === 'manifest.json'){
            continue  // Ignore self
        }

        // Load the meta data for the translation
        const meta = read_json<TranslationSourceMeta>(join('sources', trans, 'meta.json'))

        // Skip if meta data missing or not reviewed yet
        // TODO Also skip if not reviewed (must be applied before beta released)
        if (_missing_meta(meta)){
            console.error(`IGNORING ${trans} (missing year, license, name, or review)`)
            continue
        }

        // Detect what books are available
        const html_dir = join('dist', 'bibles', trans, 'html')
        const html_books = existsSync(html_dir) ?
            readdirSync(html_dir).map(name => name.slice(0, 3)) : []
        if (html_books.length === 0){
            console.error(`IGNORING ${trans} (no books)`)
            continue
        }

        // Load data extracted from books
        const extracts_path = join('sources', trans, 'extracts.json')
        if (!existsSync(extracts_path)){
            console.error(`IGNORING ${trans} (no extracts)`)
            continue
        }
        const extracts = read_json<Record<string, BookExtracts>>(extracts_path)

        // Get last_verse data as map of book id -> last_verse
        const own_last_verse:Record<string, number[]> = Object.fromEntries(
            Object.entries(extracts).map(([book, data]) => [book, data.last_verse]))

        // Get book names
        const book_names = Object.fromEntries(html_books.map(book => {
            return [book, extracts[book]?.name || book_names_english[book]!]
        }))

        // Put it all together
        // NOTE Not including meta data that client doesn't need (users can still check git repo)
        manifest.translations[trans] = {
            language: meta.language,
            name: meta.name,
            year: meta.year as number,  // Verified to exist above
            direction: meta.direction,
            audio: meta.audio,
            video: meta.video,
            copyright: meta.copyright,
            obsoleted_by: meta.obsoleted_by,
            books: book_names,
            last_verse: isEqual(last_verse, own_last_verse) ? null : own_last_verse,
        }

        // Record the language as being included
        included_languages.add(meta.language)
    }

    // Populate language data
    // NOTE Only included languages that have a translation
    const language_data = get_language_data()
    manifest.languages = Object.fromEntries(Object.entries(language_data.data.languages)
        .filter(([code]) => included_languages.has(code)))
    manifest.language2to3 = Object.fromEntries(Object.entries(language_data.data.language2to3)
        .filter(([, three]) => included_languages.has(three)))

    // Save the manifest to dist dir
    writeFileSync(join('dist', 'bibles', 'manifest.json'), JSON.stringify(manifest))
}
