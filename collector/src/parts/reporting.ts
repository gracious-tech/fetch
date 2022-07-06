
import {readdirSync} from 'fs'
import {read_json} from './utils.js'

import type {TranslationSourceMeta} from './types'


export function report_items(){
    // Output a list of all included translations
    for (const id of readdirSync('sources')){
        const meta = read_json<TranslationSourceMeta>(`sources/${id}/meta.json`)
        console.info(`${id} ${meta['year'] ?? ''} ${meta['name']['english']}`)
    }
}
