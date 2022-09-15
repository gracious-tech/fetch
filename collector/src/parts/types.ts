
// Types specific to collector

import type {MetaTranslationName, MetaCopyright, MetaBookSection} from './shared_types'


export interface CollectionConfig {
    integrations: {
        dbl: {
            token:string,
            key:string,
        },
        aws: {
            bucket:string,
            region:string,
            cloudfront:string,
        },
    },
}


export interface TranslationSource {
    service:'ebible'|'dbl'|'door43'
    id:string
    format:'usfm'|'usx1-2'|'usx3+'
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
    // Recommended is used to further customise the exclude_obsolete filter and default translation
    // They are usually based on year, but this can manually account for other factors
    // Set to false to consider even a modern translation obsolete
    // Set to true to consider a translation the best available even if others newer
    recommended:boolean|null  // Only one per language should be true
    source:TranslationSource
    reviewed:boolean
}
