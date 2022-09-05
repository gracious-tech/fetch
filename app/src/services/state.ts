
import {reactive, computed} from 'vue'

import {SyncedVerses} from '@/client/book'


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Init default state
export const state = reactive({
    trans: [] as unknown as [string, ...string[]],  // Will auto-set before app loads
    book: 'jhn',
    chapter: 1,  // Currently detected chapter
    chapter_target: null as null|number,  // Currently navigating to (null when finished)
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
