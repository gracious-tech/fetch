
<template>

<Layout />

</template>


<script lang='ts' setup>

import {onMounted} from 'vue'
import {useRouter} from 'vitepress'
import DefaultTheme from 'vitepress/theme'

import {FetchClient} from '@gracious.tech/fetch-client'
import {BibleEnhancer} from '@gracious.tech/fetch-enhancer'


const {Layout} = DefaultTheme

const endpoint = import.meta.env.PROD ? 'https://v1.fetch.bible/' : 'http://localhost:8430/'
const app_origin = import.meta.env.PROD ? 'https://app.fetch.bible' : 'http://localhost:8431'


onMounted(() => {
    const enhancer = new BibleEnhancer({
        client: new FetchClient({endpoints: [endpoint]}),
        app_origin,
        translations: ['eng_bsb', 'grc_sr'],
        before_history_push: () => {
            // Store scroll position so VP will restore upon back action (same as router does)
            history.replaceState({scrollPosition: window.scrollY}, '')
        },
    })
    self.fetch_enhancer = enhancer  // Expose so can use in /access/enhancer/

    useRouter().onAfterRouteChanged = to => {
        const doc = document.querySelector<HTMLElement>('.vp-doc')
        if (doc){
            enhancer.discover_bible_references(doc)
        }
    }

    const doc = document.querySelector<HTMLElement>('.vp-doc')
    if (doc){
        enhancer.discover_bible_references(doc)
    }
})


</script>
