
import {reactive, computed, watch} from 'vue'

import {SyncedVerses} from '@/client/esm/book'


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Parse initial config from URL fragment
const params = new URLSearchParams(self.location.hash.slice(1))


// Init default state
// TODO Prefix localStorage keys with origin (either via CSP access or url param)
const init_chapter = params.get('chapter') ?? localStorage.getItem('chapter')
const init_dark = params.get('dark') ?? localStorage.getItem('dark')
export const state = reactive({

    // Configurable by parent
    // NOTE Also update message listener in `watches.ts` if any of these change
    dark: init_dark ? init_dark === 'true' : null,  // null = auto
    status: params.get('status') ?? '',
    color: params.get('color') ?? '#c12bdb',
    back: params.get('back') === 'true',  // i.e. default to false
    button1_icon: params.get('button1_icon') ?? '',  // i.e. disabled
    button1_color: params.get('button1_color') ?? 'currentColor',
    // NOTE init.ts will ensure this has at least one translation before app loads
    trans: ((params.get('trans') ?? localStorage.getItem('trans'))?.split(',') ?? []
        ) as unknown as [string, ...string[]],
    book: params.get('book') ?? localStorage.getItem('book') ?? 'jhn',
    // `chapter` is "currently-detected" / `chapter_target` is "currently-navigating-to" (else null)
    chapter: parseInt(init_chapter ?? '1', 10),
    chapter_target: parseInt(init_chapter ?? '0', 10) || null as null|number,

    // Not configurable by parent
    content: '',
    content_verses: [] as SyncedVerses,
    show_select_chapter: false,
    show_trans_dialog: false,
    show_style_dialog: false,
    show_about_dialog: false,
    wide: wide_query.matches,
    search: null as null|string,
})


// Update wide property whenever screen width changes
const wide_query_handler = (event:MediaQueryListEvent) => {
    state.wide = event.matches
}
if ('addEventListener' in wide_query){
    wide_query.addEventListener('change', wide_query_handler)
} else {
    // For Safari less than 14
    wide_query.addListener(wide_query_handler)
}


// COMPUTES

// Array of language codes to match currently selected translations
export const langs = computed(() => {
    return state.trans.map(id => id.split('_')[0]!)
})

// Density value for toolbars etc
export const density = computed(() => {
    return state.wide ? 'default' : 'compact'
})


// METHODS

// Always update both when changing chapter so user isn't confused
export const change_chapter = (num:number) => {
    state.chapter = num
    state.chapter_target = num
}


// WATCHES

// Save some config to localStorage when it changes
watch(() => state.trans, () => {
    localStorage.setItem('trans', state.trans.join(','))
}, {deep: true})
watch(() => state.book, () => {
    localStorage.setItem('book', state.book)
})
watch(() => state.chapter, () => {
    localStorage.setItem('chapter', String(state.chapter))
})
watch(() => state.dark, () => {
    localStorage.setItem('dark', String(state.dark))
})
