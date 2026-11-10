// Watches that mix data sources

import {watch} from 'vue'
import {BibleIndex} from '@gracious.tech/fetch-search'

import {langs, state} from './state'
import {content, search_translation, search_orig, update_trans} from './content'
import {post_message} from './post'


// Whether crossrefs are currently being downloaded (so concurrent book changes don't repeat it)
let crossrefs_loading = false


// Load cross-references for the whole Bible into state (failures are left to retry later)
async function load_crossrefs(){
    if (crossrefs_loading){
        return
    }
    crossrefs_loading = true
    try {
        state.crossref = await content.client.fetch_crossrefs({min_strength: 'high'})
    } catch {
        // Leave as null so the next book change retries
    } finally {
        crossrefs_loading = false
    }
}


// Apply search URL/message param
export function apply_search_param(value:string){
    // If a single ref, go to it, otherwise display search results
    // May as well combine nav+search as a good way to provide fallback for malformed values
    const match = content.collection.bibles.string_to_reference(value, state.trans)
    if (match){
        state.book = match.book
        state.chapter = match.start_chapter
        state.verse = match.start_verse
        state.passage = match
    } else {
        state.search = value
    }
}


export function enable_watches(){

    // Translation-related
    watch(() => state.trans, () => {  // WARN Don't make async so content.index sets before app load

        // Clear search results which were based on previous translation
        state.search = ''

        // Update displayed book names
        // NOTE Don't bother with English translations since already have English names
        void (async () => {
            if (!state.trans[0].startsWith('eng_')){
                await content.collection.bibles.fetch_translation_extras(state.trans[0])
            }
            for (const book of content.collection.bibles.get_books(state.trans[0], {whole: true})){
                state.book_names[book.id] = book.name
                state.book_abbrev[book.id] = book.name_abbrev
            }
        })()

        // Also fetch book names for any other translations as can help things like searchbar
        for (const trans of state.trans.slice(1)){
            if (!trans.startsWith('eng_')){
                void content.collection.bibles.fetch_translation_extras(trans)
            }
        }

        // Generate search index whenever translation changes
        // NOTE This also results in caching entire translation which is also needed
        // NOTE Resolves to the index, but only after it has indexed all books
        const new_index = new BibleIndex(content.collection, state.trans[0])
        content.index = new_index.index_all_books().then(() => new_index)

        // For secondary translations, trigger SW cache by fetching assets (and ignoring response)
        void self.caches.open('fetch-collection').then(cache => {
            for (const trans of state.trans.slice(1)){
                for (const book of content.collection.bibles.get_books(trans)){
                    const url = content.collection.bibles.get_book_url(trans, book.id, 'html')
                    void cache.match(url).then(resp => {
                        if (!resp){
                            void fetch(url, {mode: 'cors'})  // Don't actually read contents
                        }
                    })
                }
            }
        })
    }, {deep: true, immediate: true})


    // Auto-load content as translations/book changes
    watch([() => state.trans, () => state.book], async () => {

        // Reset content so don't show old while waiting to load
        state.offline = false
        state.content = ''
        state.content_verses = []
        state.glosses = null
        state.glosses_id = content.collection.glosses.get_preferred_resource(langs.value).id
        state.notes = null

        // If first/primary trans doesn't have current book, change to a valid book
        if (!content.collection.bibles.has_book(state.trans[0], state.book)){
            state.book = content.collection.bibles.get_books(state.trans[0])[0]!.id
            return  // Will have triggered re-execution of this function
        }

        // Fetch book for each translation
        // NOTE This uses `await` so book contents is not delayed by any other network requests
        const books = await Promise.all(state.trans.map(async trans => {
            if (!content.collection.bibles.has_book(trans, state.book)){
                return null
            }
            try {
                return await content.collection.bibles.fetch_book(trans, state.book)
            } catch {
                state.offline = true
                return null
            }
        }))

        // If offline, no point updating content
        if (state.offline){
            return
        }

        // Start fetching study data now, so haven't delayed display of actual Scripture
        // NOTE Crossrefs cover the whole Bible so only load once (retrying on a later book change
        //      if a previous attempt failed)
        if (!state.crossref){
            void load_crossrefs()
        }
        void content.client.fetch_notes('eng_tyndale', state.book).then(notes => {
            state.notes = notes
        })

        // Get glosses for book
        void content.client.fetch_glosses(state.glosses_id, state.book).then(async glosses => {
            state.glosses = glosses
        })

        // Get either plain HTML or separated verses
        if (books.length === 1){
            state.content = books[0]!.get_whole()
        } else {
            state.content_verses = books.map(book => {
                if (!book){
                    return []
                }
                const verses = book.get_list()
                // `get_list()` doesn't auto-add attribution so create fake verses for it
                verses.push({id: 0, chapter: 0, verse: 0, content: book.get_attribution()})
                return verses
            })
        }
    }, {deep: true, immediate: true})


    // Listen to messages from a parent frame
    // SECURITY Any origin can embed fetch(bible) so never trust the data
    self.addEventListener('message', event => {

        // Ensure data is always an object
        const data = (typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>

        // Handle update commands
        // NOTE Also update initial load config in `state.ts` if any of these change
        if (data['type'] === 'update'){
            if (typeof data['dark'] === 'boolean' || data['dark'] === null){
                state.dark = data['dark']
            }
            if (typeof data['status'] === 'string'){
                state.status = data['status']
            }
            if (typeof data['hue'] === 'number'){
                state.hue = data['hue']
            }
            if (typeof data['saturation'] === 'number'){
                state.saturation = data['saturation']
            }
            if (typeof data['back'] === 'boolean' || typeof data['back'] === 'string'){
                state.back = data['back']
            }
            if (typeof data['button1_icon'] === 'string'){
                state.button1_icon = data['button1_icon']
            }
            if (typeof data['button1_color'] === 'string'){
                state.button1_color = data['button1_color']
            }
            if (typeof data['study_notes'] === 'boolean'){
                state.study_notes = data['study_notes']
            }
            if (typeof data['trans'] === 'string'){
                update_trans(data['trans'].split(','))
            }
            if (typeof data['search'] === 'string'){
                // NOTE state.search won't be set if value can be parsed as a reference
                apply_search_param(data['search'])
            }
        }
    })


    // Report to parent whenever translations change
    watch(() => state.trans, () => {
        post_message('translation')
    }, {deep: true})


    // Report to parent whenever currently displayed verse changes
    watch([() => state.book, () => state.chapter, () => state.verse], () => {
        post_message('verse')
    })


    // Report to parent whenever dark changes
    watch(() => state.dark, () => {
        post_message('dark')
    })


    // Get search results when search changes
    watch([() => state.search, () => state.search_orig?.words], async () => {
        state.search_results = null
        // NOTE These update state.search_results themselves so can stream results as they load
        //      Though only actually necessary for search_orig since other uses text in index
        if (state.search_orig){
            await search_orig()
        } else if (state.search){
            await search_translation()
        }
    }, {deep: true})
}
