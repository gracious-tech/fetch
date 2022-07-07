
// UTILS


declare global {
    type OneOrMore<T> = [T, ...T[]]
}


// GENERIC META STRUCTURES (common to sources and dist)


export interface MetaLanguage {
    autonym:string
    english:string
    living:boolean
}

export interface MetaTranslationName {
    autonym:string
    abbrev:string  // Should be form most recognisable by native speakers (usually not English)
    english:string
}

export interface MetaRestrictions {
    /* NOTE If there are complex interactions between conditions
        e.g. Verse limitations apply to commercial use but not other uses
        Then create multiple custom licenses to account for the various possibilities
    */
    limit_verses:number|null  // Inclusive (1000 means 1000 is ok but 1001 is a violation)
    limit_book_ratio:number|null  // Inclusive (50 means 50% of book is ok but 51% is not)
    limit_content_ratio:number|null  // Exclusive (50 means 50% is a violation but 49% isn't)
    forbid_commercial:boolean
    forbid_derivatives:boolean|'same-license'
    forbid_attributionless:boolean
    forbid_other:boolean  // Geo-restrictions etc
}

export interface MetaStandardLicense {
    name:string
    restrictions:MetaRestrictions
}

export interface MetaCopyright {
    attribution:string  // The minimum required by the licenses (or just owner name if not required)
    attribution_url:string  // Link to translation on owner's website
    licenses:{license: string|MetaRestrictions, url:string}[]
}

export interface MetaBookSection {
    start_chapter:number
    start_verse:number
    end_chapter:number
    end_verse:number
    heading:string
}


// DIST


export interface DistTranslation {
    language:string
    name:MetaTranslationName
    year:number
    direction:'ltr'|'rtl'
    audio:unknown[]
    video:unknown[]
    copyright:MetaCopyright
    obsoleted_by:string|null  // id of better translation (single even if multiple alternatives)
    books:Record<string, string>  // Books that are available and their names
    last_verse:Record<string, number[]>|null  // Null if same as most common system
}


export interface DistManifest {
    translations:Record<string, DistTranslation>
    languages:Record<string, MetaLanguage>
    language2to3:Record<string, string>
    books_ordered:string[]
    book_names_english:Record<string, string>
    last_verse:Record<string, number[]>
    licenses:Record<string, MetaStandardLicense>
}


export interface DistTranslationExtra {
    sections:Record<string, MetaBookSection[]>
    chapter_headings:Record<string, Record<number, string>>
}
