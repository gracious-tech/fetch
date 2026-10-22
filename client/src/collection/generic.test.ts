
import {describe, it, vi, afterEach} from 'vitest'
import {books_ordered} from '@gracious.tech/bible-references'

import {GenericCollection} from './generic.js'
import {RequestHandler} from '../assets/request.js'

import type {MetaLanguage, MetaRestrictions} from '../assets/shared_types.js'
import type {RuntimeManifestItem, UsageConfig} from '../assets/types.js'


const usage:UsageConfig = {commercial: false, attributionless: false, limitless: false,
    derivatives: false}
const open:MetaRestrictions = {forbid_limitless: false, forbid_commercial: false,
    forbid_derivatives: false, forbid_attributionless: false, forbid_other: false}
const ot = books_ordered.slice(0, 39)
const nt = books_ordered.slice(39)


// Build a resource entry (whole Bible by default)
function item(overrides:Partial<RuntimeManifestItem>={}):RuntimeManifestItem{
    const books_ot_list = overrides.books_ot === undefined || overrides.books_ot === true ? ot
        : overrides.books_ot
    const books_nt_list = overrides.books_nt === undefined || overrides.books_nt === true ? nt
        : overrides.books_nt
    return {
        name: {local: 'Local', local_abbrev: 'LOC', english: 'English', english_abbrev: 'ENG'},
        year: 2020,
        books_ot: true,
        books_nt: true,
        books_ot_list,
        books_nt_list,
        direction: 'ltr',
        tags: [],
        copyright: {attribution: 'Owner', attribution_url: 'https://owner',
            licenses: [{id: 'open', name: 'Open', restrictions: open, url: 'https://license'}]},
        endpoint: 'https://endpoint/',
        ...overrides,
    }
}


const languages:Record<string, MetaLanguage> = {
    eng: {local: 'English', english: 'English', pop: 300, direction: 'ltr'},
    spa: {local: 'Español', english: 'Spanish', pop: 400, direction: 'ltr'},
    cmn: {local: '中文', english: 'Chinese', pop: 900, direction: 'ltr'},
    grc: {local: 'Ελληνικά', english: 'Ancient Greek', pop: null, direction: 'ltr'},
    fra: {local: 'Français', english: 'French', pop: 80, direction: 'ltr'},  // No resources
}


// A collection with a variety of resources
function collection(items:Record<string, RuntimeManifestItem>={
    eng_new: item({year: 2020}),
    eng_old: item({year: 1611, tags: ['archaic'], name: {local: '', local_abbrev: '',
        english: 'Old', english_abbrev: 'OLD'}}),
    eng_nt: item({books_ot: [], books_nt: ['mat', 'jhn']}),
    spa_bib: item({name: {local: 'Biblia', local_abbrev: 'BIB', english: 'Bible',
        english_abbrev: 'BIB'}}),
    cmn_s: item({script: 'Hans'}),
    cmn_t: item({script: 'Hant', tags: ['recommended']}),
    grc_ot: item({books_ot: ['gen'], books_nt: []}),
}){
    return new GenericCollection(items, new RequestHandler(false), languages, {en: 'eng',
        es: 'spa', zh: 'cmn'}, ['cmn', 'eng'], usage)
}


afterEach(() => {
    vi.unstubAllGlobals()
})


describe('resources and books existence', () => {

    const c = collection()

    it("Only includes languages that have resources", ({expect}) => {
        expect(c.has_language('eng')).toBe(true)
        expect(c.has_language('fra')).toBe(false)
    })

    it("Supports composite OT|NT ids only when both halves exist", ({expect}) => {
        expect(c.has_resource('grc_ot|eng_nt')).toBe(true)
        expect(c.has_resource('grc_ot|missing')).toBe(false)
        expect(c.has_resource('grc_ot|')).toBe(false)
        expect(c.has_resource('a|b|c')).toBe(false)
        expect(c.has_book('grc_ot|eng_nt', 'gen')).toBe(true)
        expect(c.has_book('grc_ot|eng_nt', 'jhn')).toBe(true)
        expect(c.has_book('grc_ot|eng_nt', 'exo')).toBe(false)
    })

    it("Throws for unknown resources and books", ({expect}) => {
        expect(() => c.has_book('missing', 'gen')).toThrow('does not exist')
        expect(() => c._ensure_book_exists('eng_nt', 'xyz')).toThrow('is not valid')
        expect(() => c._ensure_book_exists('eng_nt', 'gen')).toThrow('does not have book "gen"')
        expect(() => c._ensure_book_exists('eng_nt', 'mat')).not.toThrow()
    })
})


describe('get_language(s)', () => {

    const c = collection()

    it("Gets a language with bilingual name", ({expect}) => {
        expect(c.get_language('spa')).toEqual({id: 'spa', code: 'spa', script: undefined,
            name_local: 'Español', name_english: 'Spanish', name_bilingual: 'Español (Spanish)',
            population: 400})
        expect(c.get_language('eng')!.name_bilingual).toBe('English')
        expect(c.get_language('fra')).toBeUndefined()
    })

    it("Includes the script only for languages split into two scripts", ({expect}) => {
        const hant = c.get_language('cmn', 'Hant')!
        expect(hant.id).toBe('cmn-Hant')
        expect(hant.name_english).toBe('Chinese (Traditional)')
        expect(hant.name_bilingual).toBe(`${hant.name_local} – Chinese (Traditional)`)
        expect(c.get_language('eng', 'Latn')!.id).toBe('eng')  // Not split
        expect(c.get_language('cmn', 'Latn')!.id).toBe('cmn')  // Not one of its scripts
    })

    it("Doesn't repeat the name when local and English match", ({expect}) => {
        const one_name = new GenericCollection({abc_a: item({script: 'Latn'}),
            abc_b: item({script: 'Cyrl'})}, new RequestHandler(false),
        {abc: {local: 'Abc', english: 'Abc', pop: 1, direction: 'ltr'}}, {}, [], usage)
        // Script names differ by locale for unknown "abc", so only check the shape
        const latn = one_name.get_language('abc', 'Latn')!
        expect(latn.name_bilingual).toContain('Abc (Latin)')
    })

    it("Splits languages into scripts only when asked", ({expect}) => {
        expect(c.get_languages().map(l => l.id)).toContain('cmn')
        expect(c.get_languages({split_scripts: true}).map(l => l.id))
            .toEqual(expect.arrayContaining(['cmn-Hans', 'cmn-Hant']))
    })

    it("Sorts by local name, English name, or population", ({expect}) => {
        expect(c.get_languages().map(l => l.id)).toEqual(['eng', 'spa', 'grc', 'cmn'])
        expect(c.get_languages({sort_by: 'english'}).map(l => l.id))
            .toEqual(['grc', 'cmn', 'eng', 'spa'])
        expect(c.get_languages({sort_by: 'population_L1'}).map(l => l.id))
            .toEqual(['cmn', 'spa', 'eng', 'grc'])
        // Most spoken list (cmn, eng) takes precedence, then L1 population
        expect(c.get_languages({sort_by: 'population'}).map(l => l.id))
            .toEqual(['cmn', 'eng', 'spa', 'grc'])
    })

    it("Sorts languages without a population last", ({expect}) => {
        const dead = new GenericCollection({grc_a: item(), hbo_a: item(), eng_a: item()},
            new RequestHandler(false), {...languages,
                hbo: {local: 'Hebrew', english: 'Hebrew', pop: null, direction: 'rtl'}},
            {}, [], usage)
        expect(dead.get_languages({sort_by: 'population_L1'}).map(l => l.id)[0]).toBe('eng')
    })

    it("Can exclude dead languages, search and return an object", ({expect}) => {
        expect(c.get_languages({exclude_old: true}).map(l => l.id)).not.toContain('grc')
        expect(c.get_languages({search: 'span'}).map(l => l.id)).toEqual(['spa'])
        expect(Object.keys(c.get_languages({object: true})).sort())
            .toEqual(['cmn', 'eng', 'grc', 'spa'])
    })
})


describe('preferred language and resource', () => {

    const c = collection()

    it("Uses given preferences, converting tags to codes", ({expect}) => {
        expect(c.get_preferred_language(['fr', 'es-MX']).id).toBe('spa')
        expect(c.get_preferred_language(['spa']).id).toBe('spa')
    })

    it("Falls back to English, else the first language", ({expect}) => {
        expect(c.get_preferred_language(['xx']).id).toBe('eng')
        const no_english = new GenericCollection({spa_a: item()}, new RequestHandler(false),
            languages, {}, [], usage)
        expect(no_english.get_preferred_language(['xx']).id).toBe('spa')
    })

    it("Uses the browser's languages when none given", ({expect}) => {
        vi.stubGlobal('self', {navigator: {languages: ['es-ES'], language: 'es-ES'}})
        expect(c.get_preferred_language().id).toBe('spa')
        vi.stubGlobal('self', {navigator: {language: 'zh-CN'}})
        expect(c.get_preferred_language().id).toBe('cmn')
        vi.stubGlobal('self', {navigator: {}})
        expect(c.get_preferred_language().id).toBe('eng')
    })

    it("Prefers the recommended resource (even if older)", ({expect}) => {
        const recommended_old = collection({eng_a: item({year: 2020}),
            eng_b: item({year: 1900, tags: ['recommended']})})
        expect(recommended_old.get_preferred_resource(['en']).id).toBe('eng_b')
        expect(c.get_preferred_resource(['zh-TW']).id).toBe('cmn_t')
    })

    it("Prefers the script implied by the preference", ({expect}) => {
        const no_recommended = collection({cmn_s: item({script: 'Hans'}),
            cmn_t: item({script: 'Hant'})})
        expect(no_recommended.get_preferred_resource(['zh-TW']).id).toBe('cmn_t')
        expect(no_recommended.get_preferred_resource(['zh-CN']).id).toBe('cmn_s')
    })

    it("Otherwise prefers full and then more modern resources", ({expect}) => {
        expect(c.get_preferred_resource(['en']).id).toBe('eng_new')
        const partial_first = collection({eng_part: item({books_ot: []}),
            eng_full: item({year: 1900})})
        expect(partial_first.get_preferred_resource(['en']).id).toBe('eng_full')
    })

    it("Falls back to the first resource if no language is known", ({expect}) => {
        // Resource's language missing from the language data, so no language can be preferred
        const unknown = new GenericCollection({xyz_a: item()}, new RequestHandler(false),
            languages, {}, [], usage)
        expect(unknown._get_preferred_resource_id(['en'])).toBe('xyz_a')
    })
})


describe('get_resource(s)', () => {

    const c = collection()

    it("Gets a resource's details with bilingual names", ({expect}) => {
        const resource = c.get_resource('eng_new')!
        expect(resource.name).toBe('Local')
        expect(resource.name_bilingual).toBe('Local (English)')
        expect(resource.name_bilingual_abbrev).toBe('LOC (ENG)')
        expect(c.get_resource('eng_old')!.name).toBe('Old')
        expect(c.get_resource('spa_bib')!.name_bilingual_abbrev).toBe('BIB')
        expect(c.get_resource('missing')).toBeUndefined()
    })

    it("Resolves composite ids by book", ({expect}) => {
        expect(c.get_resource('grc_ot|eng_nt', 'gen')!.id).toBe('grc_ot')
        expect(c.get_resource('grc_ot|eng_nt', 'jhn')!.id).toBe('eng_nt')
    })

    it("Filters by language, script and completeness", ({expect}) => {
        expect(c.get_resources({language: 'cmn'}).map(r => r.id)).toEqual(['cmn_s', 'cmn_t'])
        expect(c.get_resources({language: 'cmn', script: 'Hant'}).map(r => r.id))
            .toEqual(['cmn_t'])
        expect(c.get_resources({language: 'eng', exclude_incomplete: true}).map(r => r.id).sort())
            .toEqual(['eng_new', 'eng_old'])
    })

    it("Excludes obsolete resources only when alternatives exist", ({expect}) => {
        expect(c.get_resources({language: 'eng', exclude_obsolete: true}).map(r => r.id).sort())
            .toEqual(['eng_new', 'eng_nt'])
        const only_old = collection({eng_old: item({year: 1600, tags: ['archaic']})})
        expect(only_old.get_resources({exclude_obsolete: true}).map(r => r.id))
            .toEqual(['eng_old'])
    })

    it("Excludes resources without a license compatible with the usage", ({expect}) => {
        const nc = collection({eng_nc: item({copyright: {attribution: '', attribution_url: '',
            licenses: [{id: 'nc', name: 'NC', url: '',
                restrictions: {...open, forbid_commercial: true}}]}})})
        expect(nc.get_resources()).toHaveLength(1)
        expect(nc.get_resources({usage: {commercial: true}})).toHaveLength(0)
    })

    it("Sorts by name or year, or returns an object", ({expect}) => {
        expect(c.get_resources({language: 'eng'}).map(r => r.id)[0]).toBe('eng_old')
        expect(c.get_resources({language: 'eng', sort_by_year: true}).map(r => r.id).at(-1))
            .toBe('eng_old')
        expect(Object.keys(c.get_resources({language: 'spa', object: true}))).toEqual(['spa_bib'])
    })
})


describe('get_books / get_completion', () => {

    const c = collection()
    c._local_book_names['spa_bib'] = {
        gen: {normal: 'Génesis', long: 'El Libro de Génesis', abbrev: 'Gén'},
        exo: {normal: 'Exodus', long: '', abbrev: 'Exo'},  // Same as English
    }

    it("Lists all books as unavailable when no resource given", ({expect}) => {
        const books = c.get_books()
        expect(books).toHaveLength(66)
        expect(books.every(b => !b.available)).toBe(true)
    })

    it("Lists available books with local and bilingual names", ({expect}) => {
        const gen = c.get_books('spa_bib', {object: true})['gen']!
        expect(gen).toMatchObject({name: 'Génesis', name_abbrev: 'Gén', name_local_long:
            'El Libro de Génesis', name_bilingual: 'Génesis (Genesis)',
        name_bilingual_abbrev: 'Gén (Gen)', ot: true, nt: false, available: true})
        const exo = c.get_books('spa_bib', {object: true})['exo']!
        expect(exo.name_bilingual).toBe('Exodus')
        expect(exo.name_bilingual_abbrev).toBe('Exo')
        const lev = c.get_books('spa_bib', {object: true})['lev']!
        expect(lev).toMatchObject({name: 'Leviticus', name_local: '', name_local_long: ''})
    })

    it("Filters by testament, availability and sorts by name", ({expect}) => {
        expect(c.get_books('eng_nt').map(b => b.id)).toEqual(['mat', 'jhn'])
        expect(c.get_books('eng_nt', {whole: true})).toHaveLength(66)
        expect(c.get_books(undefined, {testament: 'ot'})).toHaveLength(39)
        expect(c.get_books(undefined, {testament: 'nt'})).toHaveLength(27)
        expect(c.get_books('eng_nt', {sort_by_name: true}).map(b => b.id)).toEqual(['jhn', 'mat'])
        expect(c.get_books('grc_ot|eng_nt').map(b => b.id)).toEqual(['gen', 'mat', 'jhn'])
    })

    it("Reports available and missing books per testament", ({expect}) => {
        const completion = c.get_completion('grc_ot|eng_nt')
        expect(completion.ot.available).toEqual(['gen'])
        expect(completion.ot.missing).toHaveLength(38)
        expect(completion.nt.available).toEqual(['mat', 'jhn'])
        expect(completion.nt.missing).toHaveLength(25)
        expect(c.get_completion('eng_nt').nt.available).toEqual(['mat', 'jhn'])
        expect(() => c.get_completion('missing')).toThrow('does not exist')
    })
})
