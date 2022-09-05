
import {readdirSync} from 'fs'
import {read_json} from './utils.js'

import type {TranslationSourceMeta} from './types'


export function _missing_meta(meta:TranslationSourceMeta){
    // True if important meta data missing (and so shouldn't publish)
    return !meta.year || !meta.copyright.licenses.length || !(meta.name.local || meta.name.english)
}


export function report_items(mode?:'missing'|'unreviewed'){
    // Output a list of all included translations
    for (const id of readdirSync('sources')){
        const meta = read_json<TranslationSourceMeta>(`sources/${id}/meta.json`)

        // Ignore depending on mode
        if (mode === 'missing' && !_missing_meta(meta)){
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
