
import {join} from 'node:path'
import {existsSync} from 'node:fs'

import {list_files, read_json} from './utils.js'

import type {DistManifestItem} from './shared_types'


// Unicode script names mapped to their ISO 15924 codes
const SCRIPTS:Record<string, string> = {
    Latin: 'Latn', Cyrillic: 'Cyrl', Greek: 'Grek', Arabic: 'Arab', Hebrew: 'Hebr', Syriac: 'Syrc',
    Thaana: 'Thaa', Devanagari: 'Deva', Bengali: 'Beng', Gurmukhi: 'Guru', Gujarati: 'Gujr',
    Oriya: 'Orya', Tamil: 'Taml', Telugu: 'Telu', Kannada: 'Knda', Malayalam: 'Mlym',
    Sinhala: 'Sinh', Thai: 'Thai', Lao: 'Laoo', Tibetan: 'Tibt', Myanmar: 'Mymr', Khmer: 'Khmr',
    Georgian: 'Geor', Armenian: 'Armn', Ethiopic: 'Ethi', Han: 'Hani', Hiragana: 'Hira',
    Katakana: 'Kana', Hangul: 'Hang', Mongolian: 'Mong', Cherokee: 'Cher',
    Canadian_Aboriginal: 'Cans', Tifinagh: 'Tfng', Vai: 'Vaii', Coptic: 'Copt', Javanese: 'Java',
    Balinese: 'Bali', Sundanese: 'Sund', Buginese: 'Bugi', Batak: 'Batk', Tai_Le: 'Tale',
    New_Tai_Lue: 'Talu', Tai_Tham: 'Lana', Tai_Viet: 'Tavt', Cham: 'Cham', Ol_Chiki: 'Olck',
    Lisu: 'Lisu', Miao: 'Plrd', Yi: 'Yiii', Bamum: 'Bamu', Nko: 'Nkoo', Adlam: 'Adlm',
    Limbu: 'Limb', Lepcha: 'Lepc', Meetei_Mayek: 'Mtei', Chakma: 'Cakm', Saurashtra: 'Saur',
    Kayah_Li: 'Kali', Hanifi_Rohingya: 'Rohg', Osage: 'Osge', Pau_Cin_Hau: 'Pauc',
    Masaram_Gondi: 'Gonm', Warang_Citi: 'Wara',
}
const SCRIPT_REGEXES = Object.entries(SCRIPTS)
    .map(([name, code]) => [code, new RegExp(`\\p{Script=${name}}`, 'gu')] as const)

// Common characters that only appear in either simplified or traditional Chinese
const HANS_ONLY = /[这们为会说来时个对过发见话长门问间东车书爱国学开关现听应经实从进还让认头谁给无]/gu
const HANT_ONLY = /[這們為會說來時個對過發見話長門問間東車書愛國學開關現聽應經實從進還讓認頭誰給無]/gu

// Books to sample text from (commonly available ones first)
const SAMPLE_BOOKS = ['mrk', 'jhn', 'luk', 'mat', 'act', 'rut', 'jon', 'gen', 'psa']


// Detect the main script of some text as an ISO 15924 code (null if it has no letters)
export function detect_script(text:string):string|null{

    // Count characters per script
    const counts:Record<string, number> = {}
    for (const [code, regex] of SCRIPT_REGEXES){
        counts[code] = text.match(regex)?.length ?? 0
    }

    // Japanese mixes Han with kana, so count them together
    const kana = counts['Hira']! + counts['Kana']!
    if (kana){
        counts['Jpan'] = counts['Hani']! + kana
    }

    // Find the most common script
    const [top, top_count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!
    if (!top_count){
        return null
    }

    // Distinguish simplified and traditional Chinese by characters unique to each
    if (top === 'Hani'){
        const hans = text.match(HANS_ONLY)?.length ?? 0
        const hant = text.match(HANT_ONLY)?.length ?? 0
        return hans > hant ? 'Hans' : hant > hans ? 'Hant' : 'Hani'
    }
    return top
}


// Collect all strings within parsed JSON, ignoring keys and type identifiers
function collect_strings(node:unknown, out:string[]){
    if (typeof node === 'string'){
        out.push(node)
    } else if (Array.isArray(node)){
        for (const item of node){
            collect_strings(item, out)
        }
    } else if (node && typeof node === 'object'){
        for (const [key, value] of Object.entries(node)){
            if (key !== 'type'){
                collect_strings(value, out)
            }
        }
    }
}


// Detect the main script of a Bible from the plain text of one of its books in its dist dir
export function detect_bible_script(dist_path:string):string|null{
    const txt_dir = join(dist_path, 'txt')
    if (!existsSync(txt_dir)){
        return null
    }
    const book_file = SAMPLE_BOOKS.map(book => `${book}.json`)
        .find(name => existsSync(join(txt_dir, name))) ?? list_files(txt_dir)[0]
    if (!book_file){
        return null
    }
    const strings:string[] = []
    collect_strings(read_json<{contents:unknown}>(join(txt_dir, book_file)).contents, strings)
    return detect_script(strings.join(' ').slice(0, 50000))
}


// Whether a detected script is consistent with the one specified in meta
function scripts_match(specified:string, detected:string):boolean{
    // Han is detected when simplified/traditional can't be told apart
    return specified === detected || (detected === 'Hani' && ['Hans', 'Hant'].includes(specified))
}


// Warn about Bibles that need their script specified, or whose specified script looks wrong
export function check_bible_scripts(bibles:Record<string, DistManifestItem>){

    // Group Bibles by language
    const by_language:Record<string, string[]> = {}
    for (const id of Object.keys(bibles)){
        (by_language[id.slice(0, 3)] ??= []).push(id)
    }

    for (const ids of Object.values(by_language)){

        // Only need to detect when could have multiple scripts or to verify a specified one
        const to_detect = ids.length > 1 ? ids : ids.filter(id => bibles[id]!.script)
        const detected = Object.fromEntries(to_detect.map(id =>
            [id, detect_bible_script(join('dist', 'bibles', id))]))
        const scripts = new Set(Object.values(detected).filter(script => script !== null))

        // Report problems
        for (const [id, script] of Object.entries(detected)){
            const specified = bibles[id]!.script
            if (specified && script && !scripts_match(specified, script)){
                console.error(`SCRIPT MISMATCH ${id} is set to ${specified} but looks like ${script}`)
            } else if (!specified && scripts.size > 1){
                console.error(`MISSING SCRIPT ${id} looks like ${script ?? "unknown"} but `
                    + `language has ${[...scripts].join('/')}`)
            }
        }
    }
}

