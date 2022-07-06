
// Types specific to collector

import type {MetaTranslationName, MetaCopyright, MetaBookSection} from './shared_types'


export interface CollectionConfig {
    integrations: {
        dbl: {
            token:string,
            key:string,
        },
        aws: {
            key_id:string,
            key_secret:string,
            bucket:string,
            region:string,
            cloudfront:string,
        },
    },
}


export interface TranslationSource {
    service:'ebible'|'dbl'|'door43'
    id:string
    format:'usfm'|'sword'|'usx1-2'|'usx3+'
    url:string
    updated:string  // yyyy-mm-dd
}


export interface BookExtracts {
    name:string|null
    sections:MetaBookSection[]
    last_verse:number[]
    chapter_headings:Record<number, string|null>  // Null if a section provides a better heading
}


export interface TranslationSourceMeta {
    language:string
    name:MetaTranslationName
    year:number|null
    direction:'ltr'|'rtl'
    audio:unknown[]
    video:unknown[]
    copyright:MetaCopyright
    obsoleted_by:string|null  // id of better translation (single even if multiple alternatives)
    source:TranslationSource
    reviewed:boolean
}
