
import {describe, it} from 'vitest'

import {LICENSES, detect_year, license_from_text, license_from_url} from './license.js'


describe('LICENSES', () => {

    it("Defines restrictions that match each CC license's conditions", ({expect}) => {
        for (const [id, {restrictions}] of Object.entries(LICENSES)){
            expect(restrictions.forbid_commercial, id).toBe(id.includes('-nc'))
            expect(restrictions.forbid_attributionless, id).toBe(id.startsWith('cc-by'))
            if (id.includes('-nd')){
                expect(restrictions.forbid_derivatives, id).toBe(true)
            } else if (id.includes('-sa')){
                expect(restrictions.forbid_derivatives, id).toBe('same-license')
            } else {
                expect(restrictions.forbid_derivatives, id).toBe(false)
            }
        }
    })
})


describe('license_from_url', () => {

    it("Normalises CC license URLs to https with a trailing slash", ({expect}) => {
        expect(license_from_url('http://creativecommons.org/licenses/by-sa/4.0')).toEqual({
            license: 'cc-by-sa',
            url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        })
    })

    it("Strips non-ASCII formatting characters scraped with the URL", ({expect}) => {
        expect(license_from_url('‪https://creativecommons.org/licenses/BY-NC-ND/4.0/'))
            .toEqual({
                license: 'cc-by-nc-nd',
                url: 'https://creativecommons.org/licenses/BY-NC-ND/4.0/',
            })
    })

    it("Detects CC0 as public domain", ({expect}) => {
        expect(license_from_url('https://creativecommons.org/publicdomain/zero/1.0/'))
            .toEqual({license: 'public', url: 'https://creativecommons.org/publicdomain/zero/1.0/'})
    })

    it("Returns null for unknown CC conditions and other URLs", ({expect}) => {
        expect(license_from_url('https://creativecommons.org/licenses/by-xx/4.0/')).toBeNull()
        expect(license_from_url('https://creativecommons.org/publicdomain/mark/1.0/')).toBeNull()
        expect(license_from_url('https://example.com/license')).toBeNull()
    })
})


describe('license_from_text', () => {

    it("Prefers a license URL within the text", ({expect}) => {
        expect(license_from_text('Licensed under '
            + '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>. Public domain.'))
            .toEqual({license: 'cc-by', url: 'https://creativecommons.org/licenses/by/4.0/'})
    })

    it("Falls back to public domain wording when no URL is recognised", ({expect}) => {
        expect(license_from_text('See https://creativecommons.org/licenses/by-xx/ (public domain)'))
            .toEqual({license: 'public', url: ''})
        expect(license_from_text('This work is in the Public Domain'))
            .toEqual({license: 'public', url: ''})
    })

    it("Returns null when the text denies or doesn't mention a license", ({expect}) => {
        expect(license_from_text('This is not public domain')).toBeNull()
        expect(license_from_text('All rights reserved')).toBeNull()
    })
})


describe('detect_year', () => {

    it("Returns the earliest standalone 4-digit year from the first source that has one",
        ({expect}) => {
            expect(detect_year('No year', 'Revised 2011, first published 1995', '1900'))
                .toBe(1995)
            expect(detect_year('Copyright 2003')).toBe(2003)
        })

    it("Ignores longer numbers and returns null if no year is found", ({expect}) => {
        expect(detect_year('Ref 123456', 'none')).toBeNull()
        expect(detect_year()).toBeNull()
    })
})
