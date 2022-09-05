
import {createApp, watch} from 'vue'
import {createVuetify} from 'vuetify'

import AppRoot from './comp/AppRoot.vue'
import AppIcon from '@/comp/AppIcon.vue'
import {state} from '@/services/state'
import {content} from '@/services/content'
import {sync_verses} from '@/client/esm/book'


// Embed global styles
import './styles.sass'
import '@/client/client.css'


// Create app
const app = createApp(AppRoot)


// Add Vuetify
app.use(createVuetify({
    theme: {
        defaultTheme: 'dark', // matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        themes: {
            dark: {
                dark: true,
                colors: {
                    primary: '#a36081',
                },
            },
            light: {
                dark: false,
                colors: {
                    primary: '#a36081',
                },
            },
        },
    },
}))


// Add global components
app.component('AppIcon', AppIcon)


// Wait for collection to load before mounting app (need for even basic UI)
void content.client.fetch_collection().then(collection => {

    // Init content state
    content.collection = collection
    content.translations = collection.get_translations({object: true})
    content.languages = collection.get_languages({object: true})

    // Auto-detect best translation
    if (!state.trans.length){
        state.trans.push(content.collection.get_preferred_translation())
    }

    // Mount app
    app.mount('#app')
})


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
