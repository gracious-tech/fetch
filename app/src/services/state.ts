
import {reactive, computed, watch} from 'vue'

import {SyncedVerses} from '@/client/esm/book'


// LOCAL STORAGE


// Prefix all storage keys with the parent's origin so settings not shared between sites
// NOTE Firefox still doesn't support `ancestorOrigins` so fallback to sharing settings
const STORAGE_PREFIX =
    self.location.ancestorOrigins?.[0] ?? (self.parent === self ? self.location.origin : 'unknown')


export const local_storage = {
    // Wrap localStorage to prevent error throws when not available
    // NOTE Might not be available in incognito tabs, iframe cookie blocking, etc

    getItem(key:string):string|null{
        try {
            return localStorage.getItem(`${STORAGE_PREFIX} ${key}`)
        } catch {
            return null
        }
    },

    setItem(key:string, value:string):void{
        try {
            localStorage.setItem(`${STORAGE_PREFIX} ${key}`, value)
        } catch {
            // pass
        }
    },
}


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Parse initial config from URL fragment
const params = new URLSearchParams(self.location.hash.slice(1))


// Init default state
const target_raw = (params.get('verse') ?? local_storage.getItem('verse') ?? '').split(':')
    .map(val => parseInt(val, 10))
let target = null as null|[number, number]
if (target_raw[0] && target_raw[1]){
    target = target_raw.slice(0, 2) as [number, number]
}
const init_dark = params.get('dark') ?? local_storage.getItem('dark')
export const state = reactive({

    // CONFIGURABLE
    // NOTE Also update message listener in `watches.ts` if any of these change

    // Settings
    dark: init_dark ? init_dark === 'true' : null,  // null = auto

    // Customise
    status: params.get('status') ?? '',
    color: params.get('color') ?? '#c12bdb',
    back: (params.get('back') === 'true' || params.get('back')) ?? false,  // true|'url'|false
    button1_icon: params.get('button1_icon') ?? '',  // i.e. disabled
    button1_color: params.get('button1_color') ?? 'currentColor',

    // Passage
    // NOTE init.ts will ensure this has at least one translation before app loads
    trans: ((params.get('trans') ?? local_storage.getItem('trans'))?.split(',') ?? []
        ) as unknown as [string, ...string[]],
    book: params.get('book') ?? local_storage.getItem('book') ?? 'jhn',
    // `chapter/verse` is "currently-detected" / `target` is "currently-navigating-to" (else null)
    chapter: target ? target[0] : 1,
    verse: target ? target[1] : 1,
    target,

    // NOT CONFIGURABLE

    // Settings
    // TODO Consider making configurable either by setting a default or disabling changing it
    show_headings: local_storage.getItem('show_headings') !== 'false',
    show_chapters: local_storage.getItem('show_chapters') !== 'false',
    show_verses: local_storage.getItem('show_verses') !== 'false',
    show_notes: local_storage.getItem('show_notes') !== 'false',
    show_redletter: local_storage.getItem('show_redletter') !== 'false',

    // State
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
    return state.trans.map(id => id.split('_')[0]!) as [string, ...string[]]
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

// Save some config to local_storage when it changes
watch(() => state.trans, () => {
    local_storage.setItem('trans', state.trans.join(','))
}, {deep: true})
watch(() => state.book, () => {
    local_storage.setItem('book', state.book)
})
watch([() => state.chapter, () => state.verse], () => {
    local_storage.setItem('verse', `${state.chapter}:${state.verse}`)
})
watch(() => state.dark, () => {
    local_storage.setItem('dark', String(state.dark))
})
watch(() => state.show_headings, () => {
    local_storage.setItem('show_headings', String(state.show_headings))
})
watch(() => state.show_chapters, () => {
    local_storage.setItem('show_chapters', String(state.show_chapters))
})
watch(() => state.show_verses, () => {
    local_storage.setItem('show_verses', String(state.show_verses))
})
watch(() => state.show_notes, () => {
    local_storage.setItem('show_notes', String(state.show_notes))
})
watch(() => state.show_redletter, () => {
    local_storage.setItem('show_redletter', String(state.show_redletter))
})
