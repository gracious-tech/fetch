
import {describe, it, vi, afterEach} from 'vitest'

import {sanitize_manifest} from './sanitize.js'


// Permissive restrictions (all conditions present)
const restrictions = {
    forbid_limitless: false,
    forbid_commercial: false,
    forbid_derivatives: false,
    forbid_attributionless: false,
    forbid_other: false,
}


// A valid resource entry, optionally overridden
function item(overrides:Record<string, unknown>={}){
    return {
        name: {local: 'Local', local_abbrev: 'L', english: 'English', english_abbrev: 'E'},
        year: 2000,
        books_ot: true,
        books_nt: ['mat', 'mrk'],
        copyright: {
            attribution: 'Owner',
            attribution_url: 'https://example.com',
            licenses: [{license: 'cc-by', url: 'https://example.com/license'}],
        },
        direction: 'ltr',
        tags: ['recommended'],
        ...overrides,
    }
}


// A valid manifest containing the given resources
function manifest(bibles:Record<string, unknown>={eng_test: item()}, extra:Record<string, unknown>={}){
    return {
        bibles,
        glosses: {},
        notes: {},
        languages: {eng: {local: 'English', english: 'English', pop: 100, direction: 'ltr'}},
        language2to3: {en: 'eng'},
        languages_most_spoken: ['eng', 'cmn'],
        books_ordered: ['gen'],
        book_names_english: {gen: 'Genesis'},
        licenses: {'cc-by': {name: 'CC BY', restrictions}},
        ...extra,
    }
}


afterEach(() => {
    vi.restoreAllMocks()
})


describe('sanitize_manifest', () => {

    it("Keeps a valid manifest unchanged and doesn't warn", ({expect}) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const raw = manifest()
        const result = sanitize_manifest(raw, 'test')
        expect(result.bibles).toEqual(raw.bibles)
        expect(result.languages).toEqual(raw.languages)
        expect(result.language2to3).toEqual(raw.language2to3)
        expect(result.languages_most_spoken).toEqual(raw.languages_most_spoken)
        expect(result.licenses).toEqual(raw.licenses)
        expect(result.book_names_english).toEqual(raw.book_names_english)
        expect(result.books_ordered).toHaveLength(66)  // Always the client's own list
        expect(warn).not.toHaveBeenCalled()
    })

    it("Throws if not an object", ({expect}) => {
        expect(() => sanitize_manifest(null, 'test')).toThrow('not a JSON object')
        expect(() => sanitize_manifest([], 'test')).toThrow('not a JSON object')
        expect(() => sanitize_manifest('x', 'test')).toThrow('not a JSON object')
    })

    it("Treats missing sections as empty", ({expect}) => {
        const result = sanitize_manifest({}, 'test')
        expect(result.bibles).toEqual({})
        expect(result.languages).toEqual({})
        expect(result.language2to3).toEqual({})
        expect(result.languages_most_spoken).toEqual([])
        expect(result.licenses).toEqual({})
        expect(result.book_names_english).toEqual({})
    })

    it("Repairs a language missing one of its names", ({expect}) => {
        const raw = manifest({}, {languages: {
            tig: {english: 'Tigre', pop: 5, direction: 'ltr'},  // The real-world crash case
            abc: {local: 'Local only'},
        }})
        const result = sanitize_manifest(raw, 'test')
        expect(result.languages['tig']).toEqual(
            {local: 'Tigre', english: 'Tigre', pop: 5, direction: 'ltr'})
        expect(result.languages['abc']).toEqual(
            {local: 'Local only', english: 'Local only', pop: null, direction: 'ltr'})
    })

    it("Drops languages with no names and warns once", ({expect}) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const raw = manifest({}, {languages: {xyz: {pop: 5}, bad: 'nope'}})
        const result = sanitize_manifest(raw, 'test')
        expect(result.languages).toEqual({})
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0]![0]).toContain('ignored 2 invalid manifest entries from test')
        expect(warn.mock.calls[0]![0]).toContain('languages/xyz')
    })

    it("Keeps rtl direction and defaults anything else to ltr", ({expect}) => {
        const raw = manifest({eng_a: item({direction: 'rtl'}), eng_b: item({direction: 'up'})},
            {languages: {eng: {local: 'E', english: 'E', direction: 'rtl'}}})
        const result = sanitize_manifest(raw, 'test')
        expect(result.languages['eng']!.direction).toBe('rtl')
        expect(result.bibles['eng_a']!.direction).toBe('rtl')
        expect(result.bibles['eng_b']!.direction).toBe('ltr')
    })

    it("Drops licenses with an invalid name or restrictions", ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const raw = manifest({}, {licenses: {
            ok: {name: 'Ok', restrictions},
            same: {name: 'Same', restrictions: {...restrictions, forbid_derivatives: 'same-license'}},
            no_name: {restrictions},
            bad_flag: {name: 'Bad', restrictions: {...restrictions, forbid_commercial: 'no'}},
            bad_derivatives: {name: 'Bad', restrictions: {...restrictions, forbid_derivatives: 1}},
            no_restrictions: {name: 'Bad'},
            not_object: 5,
        }})
        expect(Object.keys(sanitize_manifest(raw, 'test').licenses)).toEqual(['ok', 'same'])
    })

    it("Drops resources it can't use", ({expect}) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const raw = manifest({
            eng_ok: item(),
            xyz_unknown_language: item(),
            eng_not_object: 5,
            eng_no_name_object: item({name: 'x'}),
            eng_no_copyright: item({copyright: null}),
            eng_no_year: item({year: '2000'}),
            eng_blank_name: item({name: {local: '', english: ''}}),
            eng_no_books: item({books_ot: [], books_nt: ['xyz']}),
            eng_no_licenses: item({copyright: {licenses: []}}),
            eng_licenses_not_array: item({copyright: {licenses: 'cc-by'}}),
            eng_unknown_license: item({copyright: {licenses: [{license: 'nope', url: 'u'}]}}),
        })
        const result = sanitize_manifest(raw, 'test')
        expect(Object.keys(result.bibles)).toEqual(['eng_ok'])
        expect(warn.mock.calls[0]![0]).toContain('ignored 10 invalid')
        expect(warn.mock.calls[0]![0]).not.toContain('…')  // Not truncated when 10 or fewer
    })

    it("Lists at most 10 problems in the warning", ({expect}) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const bibles = Object.fromEntries([...Array(12).keys()].map(i => [`xyz_${i}`, item()]))
        sanitize_manifest(manifest(bibles), 'test')
        const message = String(warn.mock.calls[0]![0])
        expect(message).toContain('ignored 12 invalid')
        expect(message.endsWith('…')).toBe(true)
        expect(message).not.toContain('xyz_10')
    })

    it("Filters invalid books, licenses, tags and optional fields from a kept resource", ({expect}) => {
        const custom = {...restrictions, forbid_commercial: true}
        const raw = manifest({eng_test: item({
            books_ot: ['gen', 'xyz', 5],
            books_nt: true,
            copyright: {
                attribution: 5,  // Repaired to ''
                licenses: [
                    'not an object',
                    {license: 'cc-by'},  // No url
                    {license: 'cc-by', url: 'u1'},
                    {license: custom, url: 'u2'},
                    {license: {forbid_commercial: true}, url: 'u3'},  // Incomplete custom
                ],
            },
            tags: ['recommended', 'unknown', 5],
            partial: ['gen', 'xyz'],
            script: 'Latn',
            region: 'GB',
        })})
        const kept = sanitize_manifest(raw, 'test').bibles['eng_test']!
        expect(kept.books_ot).toEqual(['gen'])
        expect(kept.books_nt).toBe(true)
        expect(kept.copyright).toEqual({
            attribution: '',
            attribution_url: '',
            licenses: [{license: 'cc-by', url: 'u1'}, {license: custom, url: 'u2'}],
        })
        expect(kept.tags).toEqual(['recommended'])
        expect(kept.partial).toEqual(['gen'])
        expect(kept.script).toBe('Latn')
        expect(kept.region).toBe('GB')
    })

    it("Omits optional fields when invalid or empty", ({expect}) => {
        const raw = manifest({eng_test: item({partial: ['xyz'], script: 5, region: null,
            tags: 'recommended', name: {english: 'Only english'}})})
        const kept = sanitize_manifest(raw, 'test').bibles['eng_test']!
        expect('partial' in kept).toBe(false)
        expect('script' in kept).toBe(false)
        expect('region' in kept).toBe(false)
        expect(kept.tags).toEqual([])
        expect(kept.name).toEqual(
            {local: '', local_abbrev: '', english: 'Only english', english_abbrev: ''})
    })

    it("Drops non-string language codes and book names", ({expect}) => {
        const raw = manifest({}, {
            language2to3: {en: 'eng', xx: 5},
            book_names_english: {gen: 'Genesis', exo: null},
            languages_most_spoken: ['eng', 5],
        })
        const result = sanitize_manifest(raw, 'test')
        expect(result.language2to3).toEqual({en: 'eng'})
        expect(result.book_names_english).toEqual({gen: 'Genesis'})
        expect(result.languages_most_spoken).toEqual(['eng'])
    })

    it("Sanitizes glosses and notes the same way", ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const raw = manifest({}, {glosses: {eng_g: item(), eng_bad: 1}, notes: {eng_n: item()}})
        const result = sanitize_manifest(raw, 'test')
        expect(Object.keys(result.glosses)).toEqual(['eng_g'])
        expect(Object.keys(result.notes)).toEqual(['eng_n'])
    })
})
