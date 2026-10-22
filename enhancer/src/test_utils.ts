// Shared fixtures for enhancer tests (a small collection served by a stubbed fetch)

import {vi} from 'vitest'


const open = {forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false,
    forbid_attributionless: false, forbid_other: false}


// A Bible with John in html format
function bible(english:string, abbrev:string){
    return {
        name: {local: '', local_abbrev: '', english, english_abbrev: abbrev},
        year: 2000, books_ot: [], books_nt: ['jhn'], direction: 'ltr', tags: [],
        copyright: {attribution: 'Owner', attribution_url: '',
            licenses: [{license: 'open', url: ''}]},
    }
}


// John 3 html for the given text prefix
function john(prefix:string){
    return JSON.stringify({contents: [[], [], [],
        [['', '', ''], ...[...Array(36).keys()].map(i => ['<p>', `${prefix} 3:${i + 1}`, '</p>'])],
    ]})
}


// Stub fetch with an English and Spanish Bible (Spanish has local book names)
export function serve_collection(){
    const files:Record<string, string> = {
        'https://x/manifest.json': JSON.stringify({
            bibles: {eng_test: bible('Test', 'TST'), spa_test: bible('Prueba', 'PRB')},
            glosses: {}, notes: {}, language2to3: {en: 'eng', es: 'spa'},
            languages_most_spoken: [], books_ordered: [], book_names_english: {},
            languages: {eng: {local: 'English', english: 'English', pop: 1, direction: 'ltr'},
                spa: {local: 'Español', english: 'Spanish', pop: 1, direction: 'ltr'}},
            licenses: {open: {name: 'Open', restrictions: open}},
        }),
        'https://x/bibles/eng_test/html/jhn.json': john('ENG'),
        'https://x/bibles/spa_test/html/jhn.json': john('SPA'),
        'https://x/bibles/spa_test/extra.json': JSON.stringify({
            book_names: {jhn: {normal: 'Juan', long: 'Juan', abbrev: 'Jn'}},
            chapter_headings: {jhn: []}, sections: {jhn: []}, wj_markup: false,
        }),
    }
    const fetch = vi.fn((url:string) => Promise.resolve(url in files
        ? new Response(files[url]) : new Response('', {status: 404})))
    vi.stubGlobal('fetch', fetch)
    return fetch
}
