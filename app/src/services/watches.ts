// Watches that mix data sources

import {watch} from 'vue'

import {sync_verses} from '@/client/esm/book'

import {state} from './state'
import {content} from './content'
import {post_message} from './post'
import {wait} from './utils'


// Cache entire translation whenever it changes
watch(() => state.trans, async () => {

    // Avoid delaying render of whatever triggered this
    await wait(3000)

    // Trigger SW cache by fetching assets (and ignoring response)
    void self.caches.open('fetch-collection').then(cache => {
        for (const trans of state.trans){
            for (const book of content.collection.get_books(trans)){
                const url = content.collection.get_book_url(trans, book.id, 'html')
                void cache.match(url).then(resp => {
                    if (!resp){
                        void fetch(url)
                    }
                })
            }
        }
    })
}, {deep: true})


// Auto-load content as translations/book changes
watch([() => state.trans, () => state.book], async () => {

    // Reset content so don't show old while waiting to load
    state.offline = false
    state.content = ''
    state.content_verses = []

    // If first/primary trans doesn't have current book, change to a valid book
    if (!content.collection.has_book(state.trans[0], state.book)){
        state.book = content.collection.get_books(state.trans[0])[0]!.id
        return  // Will have triggered re-execution of this function
    }

    // Fetch book for each translation
    const books = await Promise.all(state.trans.map(async trans => {
        if (!content.collection.has_book(trans, state.book)){
            return null
        }
        try {
            return await content.collection.fetch_book(trans, state.book)
        } catch {
            state.offline = true
            return null
        }
    }))

    // If offline, no point updating content
    if (state.offline){
        return
    }

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
    // TODO Implement the same as init state has
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
watch([() => state.book, () => state.chapter, () => state.verse], () => {
    post_message('verse')
})
