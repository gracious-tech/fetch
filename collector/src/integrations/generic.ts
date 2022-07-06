
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

            // Only extract if part of protestant canon
            const [, book, ext] = /(\w\w\w)\.(\w+)$/.exec(entry.name.toLowerCase()) ?? []
            if (ext === meta.source.format && books_ordered.includes(book ?? '')){
                await extractor.extract(entry, join(format_dir, `${book!}.${ext}`))
            }
        }
    }))
}
