
import {describe, it} from 'vitest'

import {detect_script} from './scripts.js'


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

