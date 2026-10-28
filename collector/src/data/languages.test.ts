
import {describe, it} from 'vitest'

import {languages_by_total_speakers} from './languages.js'


describe('languages_by_total_speakers', () => {

    it("Lists unique ISO 639-3 codes, most spoken first", ({expect}) => {
        expect(languages_by_total_speakers[0]).toBe('eng')
        expect(new Set(languages_by_total_speakers).size).toBe(languages_by_total_speakers.length)
        for (const code of languages_by_total_speakers){
            expect(code).toMatch(/^[a-z]{3}$/)
        }
    })
})

