
import {join} from 'path'
import {writeFileSync} from 'fs'

import StreamZip from 'node-stream-zip'

import {books_ordered} from '../parts/bible.js'
import {clean_dir, concurrent, request} from '../parts/utils.js'
import {TranslationSourceMeta} from '../parts/types.js'


export async function generic_update_sources(sources:Record<string, TranslationSourceMeta>){
    // Update the source files for given translation
    await concurrent(Object.entries(sources).map(([id, meta]) => async () => {

        // Paths
        const src_dir = join('sources', id)
        const zip_path = join(src_dir, 'source.zip')
        const format_dir = join(src_dir, meta.source.format)

        // Download zip
        const zip = await request(meta.source.url, 'arrayBuffer')
        writeFileSync(zip_path, Buffer.from(zip))

        // Empty format dir
        clean_dir(format_dir)

        // Extract format files
        const extractor = new StreamZip.async({file: zip_path})
        for (const entry of Object.values(await extractor.entries())){

            // Ignore if not in a compatible format
            const ext = entry.name.toLowerCase().split('.').at(-1)!
            if (!['usx', 'usfm'].includes(ext)){
                continue
            }

            // Extract the contents to buffer
            const contents = await extractor.entryData(entry)

            // Identify what book the file is for
            // NOTE book code always at start so only search first 300 chars (normally before 100)
            const contents_str = contents.toString('utf-8', 0, 300)
            let book:string|undefined = undefined
            if (ext === 'usfm'){
                book = /^\\id (\w\w\w)/.exec(contents_str)?.[1]?.toLowerCase()
            } else if (ext === 'usx'){
                book = /<book[^>]+code="(\w\w\w)"/.exec(contents_str)?.[1]?.toLowerCase()
            }

            // Save to format dir if in protestant canon
            if (!book){
                console.error(`Valid format but couldn't identify book: ${entry.name}`)
            } else if (books_ordered.includes(book)){
                writeFileSync(join(format_dir, `${book}.${ext}`), contents)
            }
        }
    }))
}
