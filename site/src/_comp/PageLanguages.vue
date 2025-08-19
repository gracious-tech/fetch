
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
        td {{ lang.name_local }}
        td {{ lang.name_english }}
        td {{ lang.code }}
        td {{ lang.pop_text }}
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
        td {{ lang.name_local }}
        td {{ lang.name_english }}
        td {{ lang.code }}
        td {{ lang.pop_text }}
        td
            a(:href='`../bibles/#${lang.code}`') {{ lang.count }}

p
    small (Population data is a rough estimate only)

</template>


<script lang='ts' setup>

import {collection} from './collection'
import {population_text} from './utils'


// Generate list of languages
const languages = collection.bibles.get_languages().map(lang => {
    return {
        ...lang,
        count: collection.bibles.get_resources({language: lang.code}).length,
        pop_text: population_text(lang.population),
        pop: lang.population ?? 0,  // Non-null version so can sort
    }
})

// Get top 20
const languages_top20 = languages.slice().sort((a, b) => b.pop - a.pop).slice(0, 20)

</script>


<style lang='sass' scoped>
</style>
