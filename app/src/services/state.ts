
import {reactive, computed, watch} from 'vue'

import {SyncedVerses} from '@/client/esm/book'


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Parse initial config from URL fragment
const params = new URLSearchParams(self.location.hash.slice(1))


// Init default state
// TODO Prefix localStorage keys with origin (either via CSP access or url param)
const target_raw = (params.get('verse') ?? localStorage.getItem('verse') ?? '').split(':')
    .map(val => parseInt(val, 10))
let target = null as null|[number, number]
if (target_raw[0] && target_raw[1]){
    target = target_raw.slice(0, 2) as [number, number]
}
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
    // `chapter/verse` is "currently-detected" / `target` is "currently-navigating-to" (else null)
    chapter: target ? target[0] : 1,
    verse: target ? target[1] : 1,
    target,

    // Not configurable by parent
    offline: false,
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

// Change chapter helper
export const change_chapter = (num:number) => {
    state.chapter = num
    state.verse = 1
    state.target = [num, 1]
}


// WATCHES

// Save some config to localStorage when it changes
watch(() => state.trans, () => {
    localStorage.setItem('trans', state.trans.join(','))
}, {deep: true})
watch(() => state.book, () => {
    localStorage.setItem('book', state.book)
})
watch([() => state.chapter, () => state.verse], () => {
    localStorage.setItem('verse', `${state.chapter}:${state.verse}`)
})
watch(() => state.dark, () => {
    localStorage.setItem('dark', String(state.dark))
})
