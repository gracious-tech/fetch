
<template lang='pug'>

h1 The need for more access to the Bible
h3.warn Only 81% of the world has a complete bible in their language
p It is well known that there are still many languages without a bible translation. However, what is lesser known is how many languages lack a translation that is legal to freely share.
p Many Christian organizations are working towards the whole world having access to the Bible in their own language. However, what do we really mean by "access"? At the moment, access usually means you can read a translation in a select few apps, buy it in a store, and quote a few verses.
p But there are many things you #[strong can't] do with such bibles (without special permission) due to copyright, such as print portions of them yourself, include them in ministry resources, distribute audio recordings of them, etc.
p The following statistics are about bibles that are both #[strong complete] and #[strong modern] (published in last {{ modern_years }} years).

h2 Shareable bible translations
p A truely shareable bible translation is one that can be copied and quoted without verse limits.
h3.warn Only {{ world_shareable_percent }}% of the world has a translation they can legally share themselves

table
    tr
        th(colspan='4') Top languages without a shareable bible
    tr
        th Local
        th English
        th Code
        th Population
    tr(v-for='lang of languages_without_shareable_limited')
        td {{ lang.local }}
        td {{ lang.english }}
        td {{ lang.id }}
        td {{ lang.pop_str }}

p(v-if='can_display_more')
    VPButton(@click='show_more' text="Show more" theme='alt')

h2 Unrestricted bible translations
p Having true "access" to a translation should mean you can use it however you need to, including improving it. We define "unrestricted" as being either public domain or requiring only attribution (sharealike licenses also count).
h3.warn Only {{ world_unrestricted_percent }}% of the world has a bible they have unrestricted access to
//- NOTE Haven't included a table for this as overlaps too much with above and can be confusing

h2 Audio bibles
p The situation is unfortunately even worse when it comes to audio, noting that many people in the world cannot read (or prefer not to).
p
    strong Data coming soon...
//- h3.warn Only X% of the world has a shareable audio bible in their language
//- h3.warn Only X% of the world has an unrestricted audio bible in their language


hr
p
    small * These stats are based on translations we've included so far and it's usually the case there may be some we haven't added yet (but soon will)


</template>


<script setup>

import {computed, ref} from 'vue'

import {BibleClient} from './client/client.mjs'
import population from './population.json'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Languages that have the same written form as another language that does have a translation
const COVERED_BY_UNRESTRICTED_ALT = []
const COVERED_BY_SHAREABLE_ALT = [...COVERED_BY_UNRESTRICTED_ALT]


// Get translations
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()
const translations = collection.get_translations()


// Detect modern years
const modern_years = new Date().getFullYear() - collection._modern_year


// Functionality for "show more"
let displayed_items = ref(10)
const show_more = () => {
    displayed_items.value *= 2
}


// Get languages that do have a complete-modern-shareable translation
const languages_with_shareable = collection.get_languages().map(item => item.code).filter(lang => {
    return collection.get_translations({
        language: lang,
        exclude_incomplete: true,
        usage: {limitless: true},
    }).some(t => t.year >= collection._modern_year)
})


// Futher refine languages by those that have an unrestricted translation
const languages_with_unrestricted = languages_with_shareable.filter(lang => {
    return collection.get_translations({
        language: lang,
        exclude_incomplete: true,
        usage: {limitless: true, commercial: true, derivatives: 'same-license'},
    }).some(t => t.year >= collection._modern_year)
})


// Add special cases
languages_with_shareable.push(...COVERED_BY_SHAREABLE_ALT)
languages_with_unrestricted.push(...COVERED_BY_UNRESTRICTED_ALT)


// Determine which languages don't have a shareable translation
const languages_without_shareable = Object.entries(population)
    .filter(([id, data]) => !languages_with_shareable.includes(id) && data.pop)
    .sort((a, b) => b[1].pop - a[1].pop)
const languages_without_shareable_limited = computed(() => {
    return languages_without_shareable
        .slice(0, displayed_items.value)
        .map(([id, data]) => {
            const mil = Math.round(data.pop / 1000000)
            return {id, ...data, pop_str: mil ? `${mil.toLocaleString()} million` : "< 1 million"}
        })
})
const can_display_more = computed(
    () => languages_without_shareable.length > languages_without_shareable_limited.value.length)


// Work out percentages for world
let world_pop = 0
let world_shareable = 0
let world_unrestricted = 0
for (const [id, data] of Object.entries(population)){
    world_pop += data.pop
    if (languages_with_shareable.includes(id)){
        world_shareable += data.pop
    }
    if (languages_with_unrestricted.includes(id)){
        world_unrestricted += data.pop
    }
}
const world_shareable_percent = Math.round(world_shareable / world_pop * 100)
const world_unrestricted_percent = Math.round(world_unrestricted / world_pop * 100)



</script>


<style lang='sass' scoped>

.warn
    color: hsl(40, 100%, 50%)  // Work for both light/dark

</style>
