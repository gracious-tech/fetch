
import {createApp} from 'vue'
import {createVuetify} from 'vuetify'

import AppRoot from './comp/AppRoot.vue'
import AppIcon from '@/comp/AppIcon.vue'
import {state} from '@/services/state'
import {content} from '@/services/content'
import {post_message} from '@/services/post'


// Embed global styles
import './styles.sass'
import '@/client/client.css'


// Enable watches
import '@/services/watches'


// Tell parent ready to communicate
post_message('ready')


// Create app
const app = createApp(AppRoot)


// Add Vuetify
const dark_val = state.dark ?? matchMedia('(prefers-color-scheme: dark)').matches
app.use(createVuetify({
    theme: {
        defaultTheme: dark_val ? 'dark' : 'light',
        themes: {
            dark: {
                dark: true,
                colors: {
                    primary: state.color,
                },
            },
            light: {
                dark: false,
                colors: {
                    primary: state.color,
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
