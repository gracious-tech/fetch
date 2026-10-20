
import {join} from 'path'
import {existsSync} from 'fs'
import {merge} from 'lodash-es'

import {PKG_PATH, read_json, request, write_json} from './utils.js'
import {MetaLanguage} from './shared_types.js'


type Population = Record<string, {pop:number, english:string, local:string}>

interface CLDRLanguages {
    main:{
        [code:string]:{
            localeDisplayNames:{
                languages:Record<string, string>
            }
        }
    }
}

interface CLDRMisc {
    main:{
        [code:string]:{
            layout:{
                orientation:{
                    characterOrder:'left-to-right'|'right-to-left'|null
                }
            }
        }
    }
}

interface CLDRAliases {
    supplemental:{
        metadata:{
            alias:{
                languageAlias:Record<string, {_reason:string, _replacement:string}>
            }
        }
    }
}

interface LanguageData {
    languages:Record<string, MetaLanguage>
    language2to3:Record<string, string>
    macro_to_individual:Record<string, string>
}

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
    const english = read_json<CLDRLanguages>(en_path).main['en']!.localeDisplayNames.languages

    // Access to population data
    // NOTE Also has pretty good data on English & local language names that can fallback on
    const population = read_json<Population>(join(PKG_PATH, 'dist', 'data', 'population.json'))

    // Iterate through all possible ISO 639-3 codes
    // NOTE ISO source is good for codes but bad for names (only has English, some with comments)
    const iso_url = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab'
    const codes = await request(iso_url, 'text')
    for (const language of codes.trim().split('\n').slice(1)){

        // Extract fields
        const parts = language.trim().split('\t')
        const three = parts[0]!
        const two = parts[3]!
        const pop = parts[5] !== 'L' ? null : (population[three]?.pop ?? 0)
        const label = parts[6]!
        if (parts[4] === 'M'){
            macros.add(three)
        }

        // Insert into data object
        const english_name = english[three] || english[two] || population[three]?.english || label
        data.languages[three] = {
            local: population[three]?.local || english_name,
            english: english_name,
            pop,
            direction: 'ltr',  // Will be overriden later if data available
        }
        if (two.length === 2){
            data.language2to3[two] = three
        }

        // Get more-likely-to-be-accurate local name if available from CLDR data
        let cldr_code = three
        let lang_path = join(cldr_path, cldr_code, 'languages.json')
        if (!existsSync(lang_path) && two){
            cldr_code = two
            lang_path = join(cldr_path, cldr_code, 'languages.json')
        }
        if (existsSync(lang_path)){
            data.languages[three]!.local = read_json<CLDRLanguages>(lang_path)
                .main[cldr_code]!.localeDisplayNames.languages[cldr_code]!
        }

        // Get script direction if available
        const misc_path = join(cldr_path_misc, cldr_code, 'layout.json')
        if (existsSync(misc_path)){
            const cldr_direction = read_json<CLDRMisc>(misc_path)
                .main[cldr_code]!.layout.orientation.characterOrder
            data.languages[three]!.direction = cldr_direction === 'right-to-left' ? 'rtl' : 'ltr'
        }
    }

    // Find the individual language CLDR uses for each macrolanguage (e.g. 'arb' for 'ara'/'ar')
    // NOTE Resources use individual codes but browsers send macrolanguage codes
    const aliases_path = join(cldr_path, '..', '..', 'cldr-core', 'supplemental', 'aliases.json')
    const aliases = read_json<CLDRAliases>(aliases_path).supplemental.metadata.alias.languageAlias
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
        if (individuals.length === 1){
            data.macro_to_individual[macro] = individuals[0]!
        }
    }

    // Point 2 char codes of macrolanguages to their individual language
    for (const [two, three] of Object.entries(data.language2to3)){
        data.language2to3[two] = data.macro_to_individual[three] ?? three
    }

    // Apply overrides
    merge(data, overrides)

    // Save to file
    write_json(join('sources', 'languages.json'), data, true)
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
    return new Languages(read_json<LanguageData>(join('sources', 'languages.json')))
}
