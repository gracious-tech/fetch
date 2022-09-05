
import {readdirSync} from 'fs'
import {read_json} from './utils.js'

import type {TranslationSourceMeta} from './types'


export function report_items(mode?:'unlicensed'|'unreviewed'){
    // Output a list of all included translations
    for (const id of readdirSync('sources')){
        const meta = read_json<TranslationSourceMeta>(`sources/${id}/meta.json`)

        // Ignore depending on mode
        if (mode === 'unlicensed' && meta.copyright.licenses.length){
            continue
        } else if (mode === 'unreviewed' && meta.reviewed){
            continue
        }

        // Report the first license if any
        let license = meta.copyright.licenses[0]?.license
        if (!license){
            license = 'none'
        } else if (typeof license === 'object'){
            license = 'custom'
        }

        // Output fields in columns
        const fields = [id, meta.year, meta.source.format, license, meta.copyright.attribution_url]
        console.info(fields.map(field => `${field ?? 'null'}`.padEnd(16)).join(' '))
    }
}
