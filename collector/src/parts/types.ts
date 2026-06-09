
// Types specific to collector

import type {MetaTranslationName, MetaCopyright, MetaTag} from './shared_types'


export interface CollectionConfig {
    integrations: {
        aws: {
            bucket:string,
            region:string,
            cloudfront:string,
        },
    },
}


export type TransServiceId = 'ebible'|'dbl'|'door43'
export type GlossesServiceId = 'gbt'
export type GeneralServiceId = TransServiceId|GlossesServiceId
export type TransFormat = 'usx'|'usfm'


export interface SourceProps<ServiceIds=GeneralServiceId, PossibleFormats=null> {
    service:ServiceIds|'manual'
    format:PossibleFormats  // Only for standard formats, not custom ones
    updated:string  // yyyy-mm-dd (applies to first url if array)
    revision:number  // 0 if not used (applies to first url if array)
    url:string|string[]|null  // Multiple when split across sources (e.g. OT + NT zips to merge)
}


export interface CommonSourceMeta
        <ServiceIds extends string=GeneralServiceId, PossibleFormats=null> {
    name:MetaTranslationName
    year:number|null
    direction:'ltr'|'rtl'
    copyright:MetaCopyright
    tags:MetaTag[]
    ids:Partial<Record<ServiceIds, string>>
    source:SourceProps<ServiceIds, PossibleFormats>
    notes?:string  // Notes relevant to sourcing the translation and any issues that came up
    modified?:boolean  // Whether have modified source files (e.g. to fix bugs)
}


export interface TranslationSourceMeta extends CommonSourceMeta<TransServiceId, TransFormat> {
}

export interface GlossesSourceMeta extends CommonSourceMeta<GlossesServiceId, null> {
}

export interface NotesSourceMeta extends CommonSourceMeta<never, null> {
}
