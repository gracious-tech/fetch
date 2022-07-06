
// General types specific to the client

import {MetaCopyright, DistManifest, DistTranslation, MetaRestrictions}
    from './shared_types'


export interface UsageConfig {
    commercial:boolean
    attributionless:boolean
    limitless:boolean
    derivatives:boolean|'same-license'
}


export type UsageOptions = Partial<UsageConfig>


// Runtime representation of manifests differs in that it combines multiple and resolves references

export interface RuntimeLicense {
    id:string|null
    name:string
    restrictions:MetaRestrictions
    url:string
}

export type RuntimeTranslation = Omit<DistTranslation, 'last_verse'|'copyright'> & {
    last_verse:Record<string, number[]>  // Last verse not null when resolved
    copyright:Omit<MetaCopyright, 'licenses'> & {licenses:RuntimeLicense[]}
}

export type RuntimeManifest = Omit<DistManifest, 'last_verse'|'translations'> & {
    translations:Record<string, RuntimeTranslation>
}
