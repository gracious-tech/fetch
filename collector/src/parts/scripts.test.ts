
import {describe, it, vi} from 'vitest'

import {detect_script, detect_bible_script, check_bible_scripts} from './scripts.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {DistManifestItem} from './shared_types'


describe('detect_script', () => {

    it("Detects alphabetic scripts", ({expect}) => {
        expect(detect_script("In the beginning was the Word")).toBe('Latn')
        expect(detect_script("В начале было Слово")).toBe('Cyrl')
        expect(detect_script("በመጀመሪያው ቃል ነበረ")).toBe('Ethi')
        expect(detect_script("בראשית היה הדבר")).toBe('Hebr')
    })

    it("Uses the most common script when mixed", ({expect}) => {
        expect(detect_script("Вначале (1:1) было Слово, John")).toBe('Cyrl')
    })

    it("Distinguishes simplified and traditional Chinese", ({expect}) => {
        expect(detect_script("太初有道，道与神同在，这道就是神。他们说")).toBe('Hans')
        expect(detect_script("太初有道，道與神同在，這道就是神。他們說")).toBe('Hant')
        expect(detect_script("太初有道")).toBe('Hani')
    })

    it("Detects Japanese from kana mixed with Han", ({expect}) => {
        expect(detect_script("初めに言があった。言は神と共にあった。")).toBe('Jpan')
    })

    it("Returns null when there are no letters", ({expect}) => {
        expect(detect_script("1:1 — 2:3, ...")).toBe(null)
    })
})


// Plain text dist file for a book, with a heading and note that should be included as text
function txt_book(book:string, text:string){
    return {book, name: {normal: '', long: '', abbrev: ''}, contents: [[], [[], [
        {type: 'heading', contents: text, level: 1},
        text,
        {type: 'note', contents: text},
    ]]]}
}


describe('detect_bible_script', () => {

    use_temp_cwd()

    it("Returns null without any plain text books", ({expect}) => {
        expect(detect_bible_script('missing')).toBe(null)
        write_files({'empty/txt/.keep/x': ''})
        expect(detect_bible_script('empty')).toBe(null)
    })

    it("Prefers commonly available books", ({expect}) => {
        write_files({
            'b/txt/aaa.json': txt_book('gen', "В начале"),
            'b/txt/jhn.json': txt_book('jhn', "In the beginning"),
        })
        expect(detect_bible_script('b')).toBe('Latn')
    })

    it("Falls back to any book", ({expect}) => {
        write_files({'b/txt/oba.json': txt_book('oba', "В начале")})
        expect(detect_bible_script('b')).toBe('Cyrl')
    })
})


describe('check_bible_scripts', () => {

    use_temp_cwd()

    // Manifest items only need their script for checking
    function item(script?:string):DistManifestItem{
        return (script ? {script} : {}) as DistManifestItem
    }

    it("Reports mismatched and missing scripts", ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        write_files({
            'dist/bibles/srp_lat/txt/jhn.json': txt_book('jhn', "U početku"),
            'dist/bibles/srp_cyr/txt/jhn.json': txt_book('jhn', "У почетку"),
            'dist/bibles/eng_a/txt/jhn.json': txt_book('jhn', "In the beginning"),
            'dist/bibles/eng_b/txt/jhn.json': txt_book('jhn', "In the beginning"),
            'dist/bibles/cmn_a/txt/jhn.json': txt_book('jhn', "太初有道"),
            'dist/bibles/rus_a/txt/jhn.json': txt_book('jhn', "В начале"),
        })
        check_bible_scripts({
            srp_lat: item('Cyrl'),  // Wrong
            srp_cyr: item(),  // Missing when language has multiple scripts
            srp_none: item(),  // Missing and undetectable
            eng_a: item(),  // Same script as other English so fine
            eng_b: item(),
            cmn_a: item('Hant'),  // Han can't be told apart so fine
            rus_a: item('Cyrl'),  // Single Bible with script specified is verified
            fra_a: item(),  // Single Bible without script isn't checked
        })
        expect(error.mock.calls.map(call => call[0] as unknown)).toEqual([
            "SCRIPT MISMATCH srp_lat is set to Cyrl but looks like Latn",
            "MISSING SCRIPT srp_cyr looks like Cyrl but language has Latn/Cyrl",
            "MISSING SCRIPT srp_none looks like unknown but language has Latn/Cyrl",
        ])
    })
})
