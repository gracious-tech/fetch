
import {join} from 'path'
import {existsSync} from 'fs'
import {merge} from 'lodash-es'

import {z} from 'zod'

import {PKG_PATH, read_json, request, validate, write_json} from './utils.js'
import {lang_code, language_data} from './schemas.js'
import {MetaLanguage} from './shared_types.js'


// Population data bundled with the package (names may be empty strings)
const population_schema = z.record(lang_code, z.object({
    pop: z.number().int().nonnegative(),
    english: z.string(),
    local: z.string(),
}))

// CLDR <locale>/languages.json (a locale may lack a name for any given language, even its own)
const cldr_languages = z.object({
    main: z.record(z.string(), z.object({
        localeDisplayNames: z.object({
            languages: z.record(z.string(), z.string()),
        }),
    })),
})

// CLDR <locale>/layout.json
const cldr_misc = z.object({
    main: z.record(z.string(), z.object({
        layout: z.object({
            orientation: z.object({
                characterOrder: z.enum(['left-to-right', 'right-to-left']).nullable(),
            }),
        }),
    })),
})

// CLDR supplemental/likelySubtags.json (e.g. "aeb" -> "aeb-Arab-TN")
const cldr_likely = z.object({
    supplemental: z.object({
        likelySubtags: z.record(z.string(), z.string()),
    }),
})

// Scripts written right-to-left (ISO 15924), for languages CLDR has no layout data for
const RTL_SCRIPTS = new Set(['Adlm', 'Arab', 'Hebr', 'Mand', 'Mend', 'Nkoo', 'Rohg', 'Samr',
    'Syrc', 'Thaa', 'Yezi'])

// CLDR supplemental/aliases.json
const cldr_aliases = z.object({
    supplemental: z.object({
        metadata: z.object({
            alias: z.object({
                languageAlias: z.record(z.string(),
                    z.object({_reason: z.string(), _replacement: z.string()})),
            }),
        }),
    }),
})

type LanguageData = z.infer<typeof language_data>

interface LanguageDataPartial {
    languages:Record<string, Partial<MetaLanguage>>
    language2to3:Record<string, string>
    macro_to_individual:Record<string, string>
}


// Ensure these values are present in result
const overrides:LanguageDataPartial = {
    languages: {
        /* Chinese is hard to classify
            Many in China speak Mandarin but read simplified script
            Many in Taiwan speak Mandarin but read traditional script
            Many in Hong Kong speak Cantonese but read traditional script
            Many in Singapore speak Hokkien but read simplified script
        International codes and this platform learn towards classifying languages by speech
        Audio bibles can be assigned the correct spoken language
        But written Chinese bibles can't be isolated to a single spoken language
        TODO Solution: client-side aliasing (for now just putting everything in "cmn")
        */
        cmn: {local: '中文', english: "Chinese"},  // TODO Change to "Mandarin" when aliasing done
        awk: {local: 'Awabakal'},  // Population data uses region name by mistake, no CLDR data
        hbo: {direction: 'rtl'},  // No CLDR direction data
    },
    language2to3: {
        // TODO Modify to support including country codes and routing to correct spoken language
        no: 'nob',  // CLDR treats "no" as Bokmål but has no macrolanguage alias for it
    },
    macro_to_individual: {
        nor: 'nob',
    },
}


export async function gen_language_data(){
    // Generate a language data file from CLDR resources

    // Identify location of CLDR data
    let cldr_path = join(PKG_PATH, 'node_modules', 'cldr-localenames-full', 'main')
    if (!existsSync(cldr_path)){
        // Will be in repo root during dev due to workspaces
        cldr_path = join(PKG_PATH, '..', 'node_modules', 'cldr-localenames-full', 'main')
    }
    const cldr_path_misc = cldr_path.replace('cldr-localenames-full', 'cldr-misc-full')

    // Init data object
    const data:LanguageData = {languages: {}, language2to3: {}, macro_to_individual: {}}
    const macros = new Set<string>()

    // Setup access to English names of languages
    const en_path = join(cldr_path, 'en', 'languages.json')
    const english = read_json(en_path, cldr_languages).main['en']?.localeDisplayNames.languages
    if (!english){
        throw new Error(`No English language names in ${en_path}`)
    }

    // Access to each language's likely script (to infer direction when CLDR has no layout data)
    const cldr_core_path = join(cldr_path, '..', '..', 'cldr-core', 'supplemental')
    const likely = read_json(join(cldr_core_path, 'likelySubtags.json'), cldr_likely)
        .supplemental.likelySubtags
    const known_direction = new Set<string>()

    // Access to population data
    // NOTE Also has pretty good data on English & local language names that can fallback on
    const population = read_json(join(PKG_PATH, 'dist', 'data', 'population.json'),
        population_schema)

    // Iterate through all possible ISO 639-3 codes
    // NOTE ISO source is good for codes but bad for names (only has English, some with comments)
    const iso_url = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab'
    for (const row of parse_iso_639_3(await request(iso_url, 'text'), iso_url)){
        const {three, two, label} = row
        if (row.scope === 'M'){
            macros.add(three)
        }

        // Insert into data object
        // NOTE Only living languages have a population (null marks the rest as not spoken)
        const english_name = english[three] || (two && english[two])
            || population[three]?.english || label
        const entry:MetaLanguage = {
            local: population[three]?.local || english_name,
            english: english_name,
            pop: row.type === 'L' ? (population[three]?.pop ?? 0) : null,
            direction: 'ltr',  // Will be overriden later if data available
        }
        data.languages[three] = entry
        if (two){
            data.language2to3[two] = three
        }

        // Get more-likely-to-be-accurate local name if available from CLDR data
        let cldr_code = three
        let lang_path = join(cldr_path, cldr_code, 'languages.json')
        if (!existsSync(lang_path) && two){
            cldr_code = two
            lang_path = join(cldr_path, cldr_code, 'languages.json')
        }
        // NOTE Some CLDR locales (e.g. tig) lack a name for their own language, so keep fallback
        if (existsSync(lang_path)){
            const cldr_local = read_json(lang_path, cldr_languages)
                .main[cldr_code]?.localeDisplayNames.languages[cldr_code]
            if (cldr_local){
                entry.local = cldr_local
            }
        }

        // Get script direction if available, else infer it from the language's likely script
        const misc_path = join(cldr_path_misc, cldr_code, 'layout.json')
        const cldr_direction = existsSync(misc_path) ? read_json(misc_path, cldr_misc)
            .main[cldr_code]?.layout.orientation.characterOrder : undefined
        if (cldr_direction){
            entry.direction = cldr_direction === 'right-to-left' ? 'rtl' : 'ltr'
            known_direction.add(three)
        } else {
            const script = (likely[three] ?? (two && likely[two]))?.split('-')[1]
            if (script){
                entry.direction = RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr'
                known_direction.add(three)
            }
        }
    }

    // Find the individual language CLDR uses for each macrolanguage (e.g. 'arb' for 'ara'/'ar')
    // NOTE Resources use individual codes but browsers send macrolanguage codes
    const aliases_path = join(cldr_core_path, 'aliases.json')
    const aliases = read_json(aliases_path, cldr_aliases).supplemental.metadata.alias.languageAlias
    const candidates:Record<string, string[]> = {}
    for (const [code, alias] of Object.entries(aliases)){
        if (alias._reason !== 'macrolanguage'){
            continue
        }
        const individual = data.language2to3[code] ?? code
        const macro = data.language2to3[alias._replacement] ?? alias._replacement
        if (macros.has(macro) && individual in data.languages){
            (candidates[macro] ??= []).push(individual)
        }
    }

    // Skip macrolanguages that CLDR merges several individual languages into (e.g. Akan)
    for (const [macro, individuals] of Object.entries(candidates)){
        const [only] = individuals
        if (only && individuals.length === 1){
            data.macro_to_individual[macro] = only
        }
    }

    // An individual language with no direction data of its own takes its macrolanguage's
    // NOTE CLDR often only has data under the macrolanguage (e.g. 'ar' rather than 'arb')
    for (const [macro, individual] of Object.entries(data.macro_to_individual)){
        const macro_entry = data.languages[macro]
        const individual_entry = data.languages[individual]
        if (macro_entry && individual_entry && known_direction.has(macro)
                && !known_direction.has(individual)){
            individual_entry.direction = macro_entry.direction
        }
    }

    // Point 2 char codes of macrolanguages to their individual language
    for (const [two, three] of Object.entries(data.language2to3)){
        data.language2to3[two] = data.macro_to_individual[three] ?? three
    }

    // Apply overrides
    merge(data, overrides)

    // Verify the combined result (e.g. every language has non-empty names) before saving
    write_json(join('sources', 'languages.json'),
        validate(data, language_data, 'generated language data'), true)
}


// Parse and validate the ISO 639-3 code table (tab separated, with a header row)
function parse_iso_639_3(tsv:string, source:string){
    const [header, ...rows] = tsv.trim().split(/\r?\n/)
    const expected = 'Id\tPart2b\tPart2t\tPart1\tScope\tLanguage_Type\tRef_Name\tComment'
    if (header?.trim() !== expected){
        throw new Error(`Unexpected ISO 639-3 header from ${source}: ${JSON.stringify(header)}`)
    }
    const row_schema = z.tuple([
        lang_code,  // Id
        z.string(),  // Part2b
        z.string(),  // Part2t
        z.union([z.literal(''), z.string().regex(/^[a-z]{2}$/)]),  // Part1 (2 letter code)
        z.enum(['I', 'M', 'S']),  // Scope: individual, macrolanguage, special
        z.enum(['A', 'C', 'E', 'H', 'L', 'S']),  // Type: ancient, constructed, extinct, ...
        z.string().min(1),  // Ref_Name
    ], z.string())  // Comment (and any trailing columns)
    return rows.map((line, index) => {
        const [three, , , two, scope, type, label] =
            validate(line.replace(/\r$/, '').split('\t'), row_schema, `${source} row ${index + 2}`)
        return {three, two, scope, type, label}
    })
}


export class Languages {
    // An interface for interacting with language data

    data:LanguageData

    constructor(data:LanguageData){
        this.data = data
    }

    normalise(code:string):string|null{
        // Normalise a language code to a known 3 char individual language (else null)
        code = code.split('-')[0]!.toLocaleLowerCase()
        code = this.data.language2to3[code] ?? code
        code = this.data.macro_to_individual[code] ?? code
        return code in this.data.languages ? code : null
    }

}


export function get_language_data():Languages{
    // Read language data from file and return within an interface
    return new Languages(read_json(join('sources', 'languages.json'), language_data))
}
