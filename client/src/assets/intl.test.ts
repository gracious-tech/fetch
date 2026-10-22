
import {describe, it, vi, afterEach} from 'vitest'

import {likely_script, script_name} from './intl.js'


afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
})


// Import a fresh copy of the module with Intl stubbed (as it reads Intl when loaded)
async function import_with_intl(overrides:Record<string, unknown>){
    vi.stubGlobal('Intl', {...Intl, ...overrides})
    vi.resetModules()
    return import('./intl.js')
}


describe('script_name', () => {

    it("Names a script in the given locale, falling back to English", ({expect}) => {
        expect(script_name('Latn', 'en')).toBe('Latin')
        expect(script_name('Cyrl', 'fr')).toBe('cyrillique')
        expect(script_name('Latn', 'zz-unknown')).toBe('Latin')
    })

    it("Returns the code when no name is known", ({expect}) => {
        expect(script_name('Zzzq', 'en')).toBe('Zzzq')
    })

    it("Returns the code when Intl.DisplayNames isn't supported", async ({expect}) => {
        const intl = await import_with_intl({DisplayNames: undefined})
        expect(intl.script_name('Latn', 'en')).toBe('Latn')
    })
})


describe('likely_script', () => {

    it("Gets the likely script of a language tag", ({expect}) => {
        expect(likely_script('zh-TW')).toBe('Hant')
        expect(likely_script('sr')).toBe('Cyrl')
    })

    it("Returns undefined for invalid tags", ({expect}) => {
        expect(likely_script('not a tag!')).toBeUndefined()
    })

    it("Returns undefined without Intl.Locale support", async ({expect}) => {
        const intl = await import_with_intl({Locale: undefined})
        expect(intl.likely_script('zh-TW')).toBeUndefined()
    })
})
