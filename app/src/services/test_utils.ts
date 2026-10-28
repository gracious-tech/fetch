// Shared fixtures for app service tests
// WARN Import before state.ts, as it stubs matchMedia which jsdom lacks but state needs on import

import {vi} from 'vitest'
import {PassageReference} from '@gracious.tech/fetch-client'

import type {FetchCollection} from '@gracious.tech/fetch-client'


vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener: () => undefined}))


// A fake book with distinct content per translation
export function fake_book(trans:string){
    return {
        get_whole: () => `<p>${trans} whole</p>`,
        get_list: () => [{id: 1, chapter: 1, verse: 1, content: `${trans} v1`}],
        get_attribution: () => `${trans} attribution`,
        get_passage_from_ref: (ref:PassageReference) =>
            `<p>${trans} ${ref.to_serialized()}<sup>1</sup></p>`,
    }
}


// A fake collection where each translation has the given books (`fail_` ids fail to fetch)
export function fake_collection(books:Record<string, string[]>){
    const bibles = {
        has_book: vi.fn((trans:string, book:string) => !!books[trans]?.includes(book)),
        get_books: vi.fn((trans:string) => (books[trans] ?? []).map(id =>
            ({id, name: `${trans} ${id}`, name_abbrev: `${id}.`}))),
        get_book_url: vi.fn((trans:string, book:string) => `https://x/${trans}/${book}.json`),
        get_preferred_resource: vi.fn(() => ({id: Object.keys(books)[0]!})),
        fetch_translation_extras: vi.fn(() => Promise.resolve()),
        fetch_book: vi.fn((trans:string) => trans.startsWith('fail_')
            ? Promise.reject(new Error("Offline")) : Promise.resolve(fake_book(trans))),
        string_to_reference: vi.fn((value:string) =>
            value.includes(':') ? PassageReference.from_string(value) : null),
    }
    const glosses = {
        get_preferred_resource: vi.fn(() => ({id: 'eng_gbt'})),
        fetch_glosses: vi.fn(() => Promise.resolve({
            get_words: () =>
                [{word: 'In <the>', original: 'בְּ'}, {word: 'beginning', original: 'ר'}],
        })),
    }
    return {bibles, glosses} as unknown as FetchCollection & {bibles:typeof bibles,
        glosses:typeof glosses}
}
