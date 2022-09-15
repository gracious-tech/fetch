
<template lang='pug'>

h1 Languages available ({{ languages.length }})

p The following languages have at least one translation available.


h3 Top 20 most widely used languages
table
    tr
        th Local
        th English
        th Code
        th Population
        th Bibles
    tr(v-for='lang of languages_top20')
        td {{ lang.local }}
        td {{ lang.english }}
        td {{ lang.code }}
        td {{ lang.pop || "None" }}
        td
            a(:href='`../bibles/#${lang.code}`') {{ lang.count }}
p Also see which languages are <a href='/content/need/'>still without a shareable translation</a>


h3 All languages available

table
    tr
        th Local
        th English
        th Code
        th Population
        th Bibles
    tr(v-for='lang of languages')
        td {{ lang.local }}
        td {{ lang.english }}
        td {{ lang.code }}
        td {{ lang.pop || "None" }}
        td
            a(:href='`../bibles/#${lang.code}`') {{ lang.count }}

p
    small (Population data is a rough estimate only)

</template>


<script setup lang="ts">

import {BibleClient} from './client.min.esm.js'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Get collection
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()


// Generate list of languages
const languages = collection.get_languages().map(lang => {
    const mil = Math.round((lang.pop ?? 0) / 1000000)
    return {
        ...lang,
        count: collection.get_translations({language: lang.code}).length,
        pop: lang.pop === null ? "None" : (mil ? `${mil.toLocaleString()} million` : '< 1 million'),
        mil,
    }
})

// Get top 20
const languages_top20 = languages.slice().sort((a, b) => b.mil - a.mil).slice(0, 20)

</script>


<style lang='sass' scoped>
</style>
