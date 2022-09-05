
import {join} from 'path'
import {existsSync, writeFileSync} from 'fs'

import {PKG_PATH, read_json, request} from './utils.js'
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

interface LanguageData {
    languages:Record<string, MetaLanguage>
    language2to3:Record<string, string>
}


export async function gen_language_data(){
    // Generate a language data file from CLDR resources

    const cldr_path = join(PKG_PATH, 'node_modules', 'cldr-localenames-full', 'main')
    const data:LanguageData = {languages: {}, language2to3: {}}

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

        // Insert into data object
        const english_name = english[three] || english[two] || population[three]?.english || label
        data.languages[three] = {
            local: population[three]?.local || english_name,
            english: english_name,
            pop,
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
    }

    // Save to file
    writeFileSync('languages.json', JSON.stringify(data))
}


export class Languages {
    // An interface for interacting with language data

    data:LanguageData

    constructor(data:LanguageData){
        this.data = data
    }

    normalise(code:string):string|null{
        // Normalise a language code to a known 3 char version (else null)
        code = code.split('-')[0]!.toLocaleLowerCase()
        return this.data.language2to3[code] ?? (code in this.data.languages ? code : null)
    }

}


export function get_language_data():Languages{
    // Read language data from file and return within an interface
    return new Languages(read_json<LanguageData>('languages.json'))
}
