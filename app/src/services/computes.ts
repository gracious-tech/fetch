// Computed values that mix data sources

import {computed} from 'vue'

import {content} from '@/services/content'
import {state} from '@/services/state'


// Displayable text for currently selected book
export const book_display = computed(() => {
    const book =
        content.collection.get_books(state.trans[0], {object: true, whole: true})[state.book]!
    return book.local || book.english
})


// List of chapters for current book
export const chapters = computed(() => {
    if (content.collection.has_book(state.trans[0], state.book)){
        return content.collection.get_chapters(state.trans[0], state.book)
    }
    return []
})


// Displayable text for currently selected chapter (includes book name)
export const chapter_display = computed(() => {
    // Only show book name if only has one chapter
    if (chapters.value.length === 1){
        return book_display.value
    }
    // Show chapter target if still navigating to it so user knows their action was applied
    return `${book_display.value} ${state.target?.[0] || state.chapter}`
})
