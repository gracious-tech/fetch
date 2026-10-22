// Integrations with Global Bible Tools
// https://github.com/globalbibletools

import {join} from 'node:path'
import {existsSync, writeFileSync} from 'node:fs'

import StreamZip from 'node-stream-zip'
import {z} from 'zod'
import {last_verse} from '@gracious.tech/bible-references'

import {list_dirs, list_files, mkdir_exist, read_json, request, word_to_original, write_json}
    from '../parts/utils.js'
import {books_ordered} from '../parts/bible.js'
import {get_language_data} from '../parts/languages.js'

import type {GlossesData, MetaLanguage, SearchData} from '../parts/shared_types.js'
import type {CommonSourceMeta} from '../parts/types.js'


// GBT data schemas (only the fields used; unknown fields are stripped)
const gbt_data_original = z.object({
    chapters: z.array(z.object({
        verses: z.array(z.object({
            words: z.array(z.object({
                id: z.string(),
                text: z.string(),
                grammar: z.string(),
                lemma: z.string(),  // Actually a strong code
            })),
        })),
    })),
})
type GbtDataOriginal = z.infer<typeof gbt_data_original>
type GbtWordOriginal = GbtDataOriginal["chapters"][number]["verses"][number]["words"][number]

const gbt_data_gloss = z.object({
    chapters: z.array(z.object({
        verses: z.array(z.object({
            words: z.array(z.object({
                id: z.string(),
                gloss: z.string().nullable(),
            })),
        })),
    })),
})


export const gbt_source_dir = join('sources', 'glosses', 'gbt')


// Generate the meta.json for a new language that is discovered
function _generate_meta(gbt_id:string, language:MetaLanguage, source_url:string):CommonSourceMeta{
    return {
        name: {
            english: `Global Bible Tools glosses (${language.english})`,
            english_abbrev: `GBT${language.english[0]!}`,
            local: '',
            local_abbrev: '',
        },
        year: new Date().getFullYear(),
        direction: language.direction,
        copyright: {
            attribution: "Global Bible Tools",
            attribution_url: 'https://globalbibletools.com/',
            licenses: [{
                license: 'public',
                url: 'https://sellingjesus.org/free',
            }],
        },
        ids: {
            'gbt': gbt_id,
        },
        source: {
            service: 'gbt',
            format: null,  // A proprietary format
            revision: 0,  // Unused
            updated: new Date().toISOString().slice(0, 10),
            url: source_url,
        },
        tags: [],
    }
}


// Download
export async function download_glosses(){

    // Download zip
    const zip_file_path = join(gbt_source_dir, 'source.zip')
    const url = 'https://github.com/globalbibletools/data/archive/refs/heads/main.zip'
    const zip_buffer = await request(url, 'arrayBuffer')
    mkdir_exist(gbt_source_dir)
    writeFileSync(zip_file_path, Buffer.from(zip_buffer))

    // Need access to language data later
    const language_data = get_language_data()

    // Extract
    const extractor = new StreamZip.async({file: zip_file_path})
    for (const entry of Object.values(await extractor.entries())){

        // Only extract book files
        if (!entry.name.startsWith('data-main/') || !entry.name.endsWith('.json')){
            continue
        }

        // Get properties from path
        let [ , gbt_id, book] = /^data-main\/([^/]+)\/\d+-(\w+)/.exec(entry.name) ?? []
        if (!gbt_id || !book){
            continue
        }

        // Actual language code may differ from gbt_id, as will own_id
        let lang = gbt_id
        let own_id = gbt_id

        // Verify lang code
        if (lang === 'test'){
            continue
        } else if (lang === 'hbo+grc'){
            own_id = '.original'  // Put in special dir as will combine data with glosses later
        } else {
            if (gbt_id === 'idn'){
                lang = 'ind'  // Bug https://github.com/globalbibletools/data/issues/1
            } else if (gbt_id === 'are'){
                lang = 'arb'  // GBT's "are" glosses are Standard Arabic, not Western Arrarnta
            }
            lang = language_data.normalise(lang) ?? ''
            if (!lang){
                console.error(`Skipping unknown glosses language (${gbt_id})`)
                continue
            }
            own_id = lang + '_gbt'
        }

        // Verify book code
        book = book.toLowerCase()
        if (!books_ordered.includes(book)){
            console.error(`Unexpected book "${book}" for glosses language ${gbt_id}`)
            continue
        }

        // Ensure dirs exist
        const out_dir = join(gbt_source_dir, own_id, 'json')
        mkdir_exist(out_dir)

        // Write meta file if doesn't exist
        const meta_path = join(gbt_source_dir, own_id, 'meta.json')
        if (!existsSync(meta_path) && own_id !== '.original'){
            const meta_data = _generate_meta(gbt_id, language_data.data.languages[lang]!, url)
            write_json(meta_path, meta_data, true)
        }

        // Extract file
        await extractor.extract(entry, join(out_dir, `${book}.json`))
    }
}


export async function sources_to_dist(){

    // Get original language data
    const original_books:Record<string, GbtDataOriginal> = {}
    const originals_path = join(gbt_source_dir, '.original', 'json')
    for (const filename of list_files(originals_path)){
        const book = filename.slice(0, 3)
        original_books[book] = read_json(join(originals_path, filename), gbt_data_original)
    }
    if (Object.keys(original_books).length !== books_ordered.length){
        throw new Error("Missing book for original data?")
    }

    // Combine with glosses and put in dist dir
    for (const trans_id of list_dirs(gbt_source_dir)){

        // Deal with exceptions
        if (trans_id === '.original'){
            continue  // Skip special dir
        }

        // Process each book
        const lang_path = join(gbt_source_dir, trans_id, 'json')
        for (const filename of list_files(lang_path)){

            // Read data (book comes from an external filename so confirm it's a real book)
            const book = filename.slice(0, 3)
            const last_verses_for_book = last_verse[book]
            if (!last_verses_for_book){
                throw new Error(`Unknown book "${book}" in GBT data (${trans_id} ${filename})`)
            }
            const book_words = original_books[book]
            if (!book_words){
                throw new Error(`No original language data for ${book} (${trans_id})`)
            }
            const book_glosses = read_json(join(lang_path, filename), gbt_data_gloss)

            // 3JN 1:15 is common in only half of bibles, so insert empty verse
            // NOTE Chapters may not exist yet as structure is only verified below
            if (book === '3jn'){
                for (const data of [book_words, book_glosses]){
                    const chapter = data.chapters[0]
                    if (chapter){
                        chapter.verses[15-1] ??= {words: []}
                    }
                }
            }
            // REV 12:18 is common in only half of bibles, so insert empty verse
            if (book === 'rev'){
                for (const data of [book_words, book_glosses]){
                    const chapter = data.chapters[12-1]
                    if (chapter){
                        chapter.verses[18-1] ??= {words: []}
                    }
                }
            }

            // Verify same number of chapters and verses as expected (for both original and gloss)
            for (const gbt_data of [book_words, book_glosses]){
                if (last_verses_for_book.length !== gbt_data.chapters.length){
                    throw new Error(`Different number of chapters for ${trans_id} ${book}`)
                }
                for (let i = 0; i < last_verses_for_book.length; i++){
                    const num_verses = gbt_data.chapters[i]!.verses.length
                    const num_verses_expected = last_verses_for_book[i]!
                    if (num_verses !== num_verses_expected){
                        throw new Error(`Chapter has ${num_verses} verses but expected`
                            + ` ${num_verses_expected} (${trans_id} ${book} ch${i+1})`)
                    }
                }
            }

            // Count how many words have a gloss
            let word_total = 0
            let gloss_total = 0

            // Compile data
            const processed_data:GlossesData = {
                trans_id,
                book,
                contents: [[]],  // Start with chapter 0
            }
            for (let chapter_i = 0; chapter_i < last_verses_for_book.length; chapter_i++){
                const current_chapter:[string, string][][] = [[]]  // Start with verse 0
                processed_data.contents.push(current_chapter)
                for (let verse_i = 0; verse_i < last_verses_for_book[chapter_i]!; verse_i++){
                    const current_verse:[string, string][] = []
                    current_chapter.push(current_verse)

                    // Get data for verse
                    const verse_words = book_words.chapters[chapter_i]!.verses[verse_i]!.words
                    const verse_glosses = book_glosses.chapters[chapter_i]!.verses[verse_i]!.words

                    // Confirm same number of words (GBT's data integrity check)
                    if (verse_words.length !== verse_glosses.length){
                        throw new Error("GBT data has different number of words in verse")
                    }

                    // Add verse
                    for (let word_i = 0; word_i < verse_words.length; word_i++){

                        // May be missing gloss but should never miss word or lemma
                        const word = verse_words[word_i]!.text.trim()
                        const gloss = (verse_glosses[word_i]!.gloss ?? '').trim()
                        if (!word){
                            throw new Error(`Missing word data`)
                        }

                        // Add word
                        current_verse.push([word, gloss])
                        word_total += 1
                        if (gloss){
                            gloss_total += 1
                        }
                    }
                }
            }

            // Get percent of how many words have been glossed for the book
            const percent_glossed = Math.floor(gloss_total / word_total * 100)

            // Save book's data if almost complete
            // NOTE When can't translate, will be '-' so still counts as glossed
            if (percent_glossed > 95){
                const lang_dist_dir = join('dist', 'glosses', trans_id, 'json')
                mkdir_exist(lang_dist_dir)
                write_json(join(lang_dist_dir, `${book}.json`), processed_data)
            }
        }
    }

    // Generate search data
    // WARN When strongs code unknown, 'H????' is used, so make empty string instead
    _gen_search_data(original_books, 'strongs',
        w => w.lemma.includes('?') ? '' : w.lemma.trim())
    _gen_search_data(original_books, 'original', w => word_to_original(w.text))
}


// Generate search data from GBT data
function _gen_search_data(original_books:Record<string, GbtDataOriginal>, type:'strongs'|'original',
        extractor:(w:GbtWordOriginal)=>string){

    // Compile search data by testament
    // NOTE It's assumed chapter/verse numbers are all correct and verified above already
    const ot_data:Record<string, string[][]> = {}
    const nt_data:Record<string, string[][]> = {}
    for (const book in original_books){
        const is_ot = books_ordered.indexOf(book) < 39
        const testament = is_ot ? ot_data : nt_data
        testament[book] = [[]]  // Start with chapter 0
        for (const chapter of original_books[book]!.chapters){
            const current_chapter:string[] = ['']  // Start with verse 0
            testament[book].push(current_chapter)
            for (const verse of chapter.verses){
                // WARN Do not space-separate as some may be empty strings and appear need trimming
                current_chapter.push(verse.words.map(extractor).join(','))
            }
        }
    }

    // Define dirs
    const ot_dir = join('dist', 'search', 'ot_gbt')
    const nt_dir = join('dist', 'search', 'nt_gbt')
    mkdir_exist(ot_dir)
    mkdir_exist(nt_dir)

    // Meta data
    const url = 'https://github.com/globalbibletools/data'

    // Write OT data
    write_json(join(ot_dir, `${type}.json`), {
        id: 'ot_gbt',
        source: "Global Bible Tools Old Testament",
        url,
        books: ot_data,
    } as SearchData)

    // Write NT data
    write_json(join(nt_dir, `${type}.json`), {
        id: 'nt_gbt',
        source: "Global Bible Tools New Testament",
        url,
        books: nt_data,
    } as SearchData)
}
