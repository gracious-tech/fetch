
import {reactive, computed} from 'vue'

import {SyncedVerses} from '@/client/book'


// STATE

// Create media query for screen width
const wide_query = self.matchMedia('(min-width: 1000px)')


// Init default state
export const state = reactive({
    trans: [] as unknown as [string, ...string[]],  // Will auto-set before app loads
    book: 'jhn',
    chapter: 1,
    content: '',
    content_verses: [] as SyncedVerses,
    show_select_chapter: false,
    show_trans_dialog: false,
    wide: wide_query.matches,
    search: null as null|string,
})


// Update wide property whenever screen width changes
wide_query.addEventListener('change', event => {
    state.wide = event.matches
})


// COMPUTES

// Array of language codes to match currently selected translations
export const langs = computed(() => {
    return state.trans.map(id => id.split('_')[0]!)
})
