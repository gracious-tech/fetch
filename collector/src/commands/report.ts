
import {join} from 'path'
import {existsSync} from 'fs'

import {books_ordered} from '@gracious.tech/bible-references'

import {read_json, list_dirs, list_files} from '../parts/utils.js'
import {_missing_meta, _missing_meta_fields} from '../parts/manifest.js'

import type {TranslationSourceMeta} from '../parts/types'


export function report_items(){
    // Output a list of all included translations
    for (const id of list_dirs(join('sources', 'bibles'))){
        const meta = read_json<TranslationSourceMeta>(join('sources', 'bibles', id, 'meta.json'))

        // Report the first license if any
        let license = meta.copyright.licenses[0]?.license
        if (!license){
            license = 'none'
        } else if (typeof license === 'object'){
            license = 'custom'
        }

        // Get URL for source's page for translation
        let url = ''
        if (meta.source.service === 'dbl'){
            url = `https://app.thedigitalbiblelibrary.org/entry?id=${meta.ids.dbl!}`
        } else if (meta.source.service === 'ebible'){
            url = `https://ebible.org/Scriptures/details.php?id=${meta.ids.ebible!}`
        }

        // Output fields in columns
        const fields = [id, meta.year, license, url]
        console.info(fields.map(field => `${field ?? 'null'}`.padEnd(16)).join(' '))
    }
}


export function report_invalid_meta(){
    // Output a list of translations that have invalid metadata
    for (const id of list_dirs(join('sources', 'bibles'))){
        const meta = read_json<TranslationSourceMeta>(join('sources', 'bibles', id, 'meta.json'))

        // See if missing any metadata
        const missing = _missing_meta_fields(meta)
        if (missing.length){
            const meta_path = join('sources', 'bibles', id, 'meta.json')
            console.error(`MISSING META [${missing.join(', ')}]: ${meta_path}`)
        }

        // See if ids not consistent
        const service = meta.source.service
        if (service === 'dbl' || service === 'ebible'){
            const service_id = meta.ids[service]!
            const attr_url = meta.copyright.attribution_url
            if ((attr_url.includes('ebible') || attr_url.includes('digitalbiblelibrary'))
                    && !meta.copyright.attribution_url.includes(service_id)){
                console.error(`WRONG ATTRIBUTION: ${id}`)
            }

            // Only first url applies to props like id (when an array of urls)
            const first_url = Array.isArray(meta.source.url) ? meta.source.url[0]!
                : meta.source.url!
            if (!first_url.includes(service_id)){
                console.error(`WRONG ID IN SOURCE URL: ${id}`)
            }
        }
    }
}


export function report_invalid_books(report_no_books=false){
    // Report translations that have invalid books
    for (const id of list_dirs(join('sources', 'bibles'))){
        const src_format = existsSync(join('sources', 'bibles', id, 'usx')) ? 'usx' : 'usfm'
        const files = list_files(join('sources', 'bibles', id, src_format))
        const invalid = files.filter(f => f.endsWith('.invalid')).map(b => b.slice(0, 3))
        const num_valid = files.length - invalid.length
        if (report_no_books){
            if (num_valid === 0){
                console.error(`NO BOOKS: ${id}`)
            }
        } else {
            if (invalid.length){
                console.error(`${id.padEnd(10)}   ${invalid.length.toString().padStart(2)}  `
                    + `${invalid.slice(0, 5).join(',')}`)
            }
        }
    }
}


export function report_incomplete(){
    // Report translations that almost have all books for a testament (i.e. an issue with a few)
    // In such cases the translation is likely complete but there's a processing issue

    const ot_books = books_ordered.slice(0, 39)
    const nt_books = books_ordered.slice(39)

    for (const id of list_dirs(join('sources', 'bibles'))){

        // Get list of valid source books
        const src_format = existsSync(join('sources', 'bibles', id, 'usx')) ? 'usx' : 'usfm'
        const files_list = list_files(join('sources', 'bibles', id, src_format))
        const valid_books = files_list.filter(f => !f.endsWith('.invalid')).map(f => f.slice(0, 3))
        const invalid = files_list.length - valid_books.length

        // Identify missing books but pretend none are missing if a lot are missing
        let missing_ot = ot_books.filter(b => !valid_books.includes(b))
        if (missing_ot.length > 5){
            missing_ot = []
        }
        let missing_nt = nt_books.filter(b => !valid_books.includes(b))
        if (missing_nt.length > 5){
            missing_nt = []
        }

        // Report if missing only a few books
        if (missing_ot.length || missing_nt.length){
            console.error(`OT ${missing_ot.length.toString().padStart(2)}`
                + `   NT ${missing_nt.length.toString().padStart(2)}   `
                + `   INV. ${invalid.toString().padStart(2)}   ${id.padEnd(10)}   `
                + [...missing_ot, ...missing_nt].join(','))
        }
    }
}


export function report_unprocessed(type?:'usfmx'|'other'){
    // Report which translations haven't been completely processed to distributable forms yet

    let count = 0

    for (const id of list_dirs(join('sources', 'bibles'))){

        // Find out how many original source files there are
        const src_format = existsSync(join('sources', 'bibles', id, 'usx')) ? 'usx' : 'usfm'
        const src_dir = join('sources', 'bibles', id, src_format)
        const expected_files = list_files(src_dir).filter(f => !f.endsWith('.invalid'))
        const expected = expected_files.map(b => b.slice(0, 3))
        const expected_num = expected.length

        // Count number of processed files by type
        const dist_dir = join('dist', 'bibles', id)
        const usfm_num = list_files(join(dist_dir, 'usfm')).length
        const usx_num = list_files(join(dist_dir, 'usx')).length
        const html_num = list_files(join(dist_dir, 'html')).length
        const txt_books = list_files(join(dist_dir, 'txt')).map(b => b.slice(0, 3))
        const txt_num = txt_books.length

        // For the type with the least amount of files, get the number
        let min_num = Math.min(usfm_num, usx_num, html_num, txt_num)
        if (type === 'usfmx'){
            min_num = Math.min(usfm_num, usx_num)
        } else if (type === 'other'){
            if (usx_num < expected_num || usfm_num < expected_num){
                // If couldn't convert to usfm/usx then wouldn't have tried other formats
                continue
            }
            min_num = Math.min(html_num, txt_num)
        }

        // If less processed files than source files, report
        if (min_num < expected_num){
            count++
            // Give guess on which books haven't been processed by checking txt format
            const books = expected_files
                .filter(f => !txt_books.includes(f.slice(0, 3)))
                .slice(0, 5)
                .map(f => join(src_dir, f))
                .join(' ')
            console.error(min_num.toString().padStart(2) + ' / '
                + expected_num.toString().padStart(2) + '  ' + id.padEnd(10) + books)
        }
    }

    console.info(`\nTotal: ${count}`)
}
