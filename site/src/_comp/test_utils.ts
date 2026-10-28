// Shared fixtures for site component tests (a small real collection served by a stubbed fetch)

import {vi} from 'vitest'
import {FetchClient} from '@gracious.tech/fetch-client'
import {defineComponent, h} from 'vue'

import type {FetchCollection} from '@gracious.tech/fetch-client'


// Restrictions where nothing is forbidden
const open = {forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false,
    forbid_attributionless: false, forbid_other: false}


// A Bible in the given language with the given books, year, license and owner
function bible(english:string, year:number, books_ot:true|string[], books_nt:true|string[],
        license:string|typeof open, attribution:string){
    return {
        name: {local: '', local_abbrev: '', english, english_abbrev: english.slice(0, 3)},
        year, books_ot, books_nt, direction: 'ltr', tags: [],
        copyright: {attribution, attribution_url: '',
            licenses: [{license, url: `https://license/${english}`}]},
    }
}


// The manifest of a small collection covering whole/partial bibles, licenses and owners
export const manifest = {
    bibles: {
        eng_new: bible("New English", 2010, true, true, 'cc-by',
            "© 2010 The Bible Society, Inc."),
        eng_old: bible("Old English", 1900, [], true, 'cc-by-nd', "Bible Society"),
        spa_mix: bible("Spanish Mix", 1985, ['gen'], true, 'cc-by-sa', "Someone"),
        grc_part: bible("Greek Part", 1800, [], ['mat'], {...open, forbid_commercial: true},
            "(c) Someone"),
    },
    glosses: {}, notes: {}, language2to3: {en: 'eng', es: 'spa'},
    languages_most_spoken: ['eng'], books_ordered: [], book_names_english: {},
    languages: {
        eng: {local: 'English', english: 'English', pop: 400_000_000, direction: 'ltr'},
        spa: {local: 'Español', english: 'Spanish', pop: 500_000_000, direction: 'ltr'},
        grc: {local: 'Ἑλληνική', english: 'Ancient Greek', pop: null, direction: 'ltr'},
    },
    licenses: {
        'cc-by': {name: "CC BY", restrictions: open},
        'cc-by-nd': {name: "CC BY-ND", restrictions: {...open, forbid_derivatives: true}},
        'cc-by-sa': {name: "CC BY-SA",
            restrictions: {...open, forbid_derivatives: 'same-license' as const}},
        'unused': {name: "Unused", restrictions: open},
    },
}


// Fetch the fixture manifest as a real collection (for mocking `./collection`)
export async function make_collection():Promise<FetchCollection>{
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(manifest)))))
    const collection = await new FetchClient({endpoints: ['https://x/']}).fetch_collection()
    vi.unstubAllGlobals()
    return collection
}


// Stand-in for VitePress' global VPButton (renders a button that emits click)
export const VPButton = defineComponent({
    props: {text: {type: String, default: ''}},
    emits: ['click'],
    setup(props, {emit}){
        return () => h('button', {onClick: () => emit('click')}, props.text)
    },
})


// Text content of each row of the given table (cells joined by |), excluding header rows
export function table_rows(table:Element):string[]{
    return [...table.querySelectorAll('tr')].filter(tr => tr.querySelector('td'))
        .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent?.trim()).join('|'))
}
