// Watches that mix data sources

import {watch} from 'vue'

import {sync_verses} from '@/client/esm/book'

import {state} from './state'
import {content} from './content'
import {post_message} from './post'


// Auto-load content as translations/book changes
watch([() => state.trans, () => state.book], async () => {

    // Reset content so don't show old while waiting to load
    state.content = ''
    state.content_verses = []

    // If first/primary trans doesn't have current book, change to a valid book
    if (!content.collection.has_book(state.trans[0], state.book)){
        state.book = content.collection.get_books(state.trans[0])[0]!.id
        return  // Will have triggered re-execution of this function
    }

    // Fetch book for each translation
    const books = await Promise.all(state.trans.map(trans => {
        if (!content.collection.has_book(trans, state.book)){
            return null
        }
        return content.collection.fetch_html(trans, state.book)
    }))

    // Get either plain HTML or separated verses
    if (books.length === 1){
        state.content = books[0]!.get_whole()
    } else {
        state.content_verses = sync_verses(
            books.map(book => book ? book.get_whole({list: true}) : []))
    }
}, {deep: true})


// Listen to messages from a parent frame
// SECURITY Any origin can embed fetch(bible) so never trust the data
self.addEventListener('message', event => {

    // Ensure data is always an object
    const data = (typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>

    // Handle update commands
    // NOTE Also update initial load config in `state.ts` if any of these change
    if (data['type'] === 'update'){
        if (typeof data['status'] === 'string'){
            state.status = data['status']
        }
        if (typeof data['color'] === 'string'){
            state.color = data['color']
        }
        if (typeof data['back'] === 'boolean'){
            state.back = data['back']
        }
        if (typeof data['button1_icon'] === 'string'){
            state.button1_icon = data['button1_icon']
        }
        if (typeof data['button1_color'] === 'string'){
            state.button1_color = data['button1_color']
        }
    }
})


// Report to parent whenever currently displayed verse changes
// TODO Currently only reporting chapter changes
watch([() => state.chapter, () => state.book], () => {
    post_message('verse_change')
})
