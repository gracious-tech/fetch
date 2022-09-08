
import {reactive, computed} from 'vue'

import {SyncedVerses} from '@/client/esm/book'


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Parse initial config from URL fragment
const params = new URLSearchParams(self.location.hash.slice(1))


// Init default state
export const state = reactive({

    // Configurable by parent
    // NOTE Also update message listener in `watches.ts` if any of these change
    dark: params.get('dark') ? params.get('dark') === 'true' : null,  // null = auto
    status: params.get('status') ?? '',
    color: params.get('color') ?? '#c12bdb',
    back: params.get('back') === 'true',  // i.e. default to false
    button1_icon: params.get('button1_icon') ?? '',  // i.e. disabled
    button1_color: params.get('button1_color') ?? 'currentColor',
    book: params.get('book') ?? 'jhn',
    // `chapter` is "currently-detected" / `chapter_target` is "currently-navigating-to" (else null)
    chapter: parseInt(params.get('chapter') ?? '1', 10),
    chapter_target: parseInt(params.get('chapter') ?? '0', 10) || null as null|number,

    // Not configurable by parent
    trans: [] as unknown as [string, ...string[]],  // Will auto-set before app loads
    content: '',
    content_verses: [] as SyncedVerses,
    show_select_chapter: false,
    show_trans_dialog: false,
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


// METHODS

// Always update both when changing chapter so user isn't confused
export const change_chapter = (num:number) => {
    state.chapter = num
    state.chapter_target = num
}
