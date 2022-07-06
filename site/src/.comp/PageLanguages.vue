
<template lang='pug'>

h1 Languages available ({{ languages.length }})

p
    | The following languages have at least one translation available.
    | Also see the <a href='/content/stats/'>statistics page</a> for the top 20 languages
    | still without a modern open translation.

table
    tr
        th Code
        th Autonym
        th English
        th Living
        th Population
        th Bibles
    tr(v-for='lang of languages')
        td {{ lang.code }}
        td {{ lang.autonym }}
        td {{ lang.english }}
        td {{ lang.living ? "Yes" : "No" }}
        td {{ lang.pop }}
        td
            a(:href='`../bibles/#${lang.code}`') {{ lang.count }}

p
    small * Population data is a rough estimate only

</template>


<script setup lang="ts">

// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Import client and get collection
const {BibleClient} = await import(location.origin + '/client.min.esm.js')
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()


// Import population data
const population = await (await fetch('/population.json')).json()


// Generate list of languages
const languages = collection.get_languages().map(lang => {
    const mil = Math.round((population.find(item => item.id === lang.code)?.pop ?? 0) / 1000000)
    return {
        ...lang,
        count: collection.get_translations({language: lang.code}).length,
        pop: mil ? `${mil.toLocaleString()} million` : '?',
    }
})

</script>


<style lang='sass'>
</style>
