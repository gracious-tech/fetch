
<template lang='pug'>

h1 Statistics
p More information on the Bible translations available.

h2 Books available
table
    tr
        th Testaments
        th Translations
    tr(v-for='item of Object.values(testaments)')
        td {{ item.name }}
        td {{ per(item.count) }}


//- TODO When audio/video implemented
h2 Media available
table
    tr
        th Media
        th Translations
    tr
        td Audio available
        td 0%
    tr
        td Video available
        td 0%


h2 Licenses
table
    tr
        th License
        th Translations
    tr(v-for='license of licenses')
        td {{ license.display }}
        td {{ per(license.count) }}


h2 Restrictions
table
    tr
        th Allows
        th Translations
    tr(v-for='usage of usages')
        td {{ usage.name }}
        td {{ usage.count }}


h2 Year of publication
table
    tr
        th Period
        th Translations
    tr(v-for='period of periods')
        td {{ period.display }}
        td {{ per(period.count) }}


h2 No free modern translation
p Only {{ world_percent }}% of the world has free access to a Bible translation
p The top 20 most commonly used languages that do not have a Bible translation that is complete, modern (published after {{ modern_year }}), and free to share (no quotation limits).
table
    tr
        th Local
        th English
        th Code
        th Population
    tr(v-for='lang of missing_languages')
        td {{ lang.local }}
        td {{ lang.english }}
        td {{ lang.id }}
        td {{ lang.pop }}


h2 Owner
table
    tr
        th Owner
        th Translations
    tr(v-for='owner of owners')
        td {{ owner.name }}
        td {{ owner.count }}
p
    small (This is a rough estimate only)


</template>


<script setup>

import {BibleClient} from './client.min.esm.js'
import population from './population.json'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Get translations
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()
const translations = collection.get_translations()


// Util for getting count as a percentage string of total translations
const per = count => Math.floor(count / translations.length * 100) + '%'


// Generate list of periods
const epoch = 1950
const this_year = new Date().getFullYear()
let periods = [...Array(Math.ceil((this_year - epoch) / 10)).keys()].map(n => {
    const start = n*10 + epoch
    return {
        start,
        end: start + 9,
        display: `${start}s`,
    }
})
periods.reverse()
periods.push({start: 0, end: epoch-1, display: `Pre-${epoch}`})
periods = periods.map(period => {
    return {
        ...period,
        count: translations.filter(t => t.year >= period.start && t.year <= period.end).length,
    }
})


// Generate list of licenses
const licenses = Object.entries(collection._manifest.licenses).map(([id, props]) => {
    return {
        display: props.name,
        count: translations.filter(t => t.licenses.some(l => l.id === id)).length,
    }
}).filter(l => l.count)
const license_codes = Object.keys(collection._manifest.licenses)
licenses.push({
    display: "Custom license only",
    count: translations.filter(t => !t.licenses.some(l => l.id)).length,
})


// Generate list of languages lacking free modern translation
const modern_year = 1950
const has_free_modern = collection.get_languages().map(item => item.code).filter(lang => {
    return collection.get_translations({
        language: lang,
        exclude_incomplete: true,
        usage: {limitless: true},
    }).some(t => t.year >= modern_year)
})
const missing_languages = Object.entries(population)
    .filter(([id]) => !has_free_modern.includes(id))
    .sort((a, b) => b[1].pop - a[1].pop)
    .slice(0, 100)  // TODO Reduce to 20 once research done
    .map(([id, data]) => {
        const mil = Math.round(data.pop / 1000000).toLocaleString()
        return {id, ...data, pop: `${mil} million`}
    })


// Work out how much of world is without a free modern translation
let world_pop = 0
let world_has = 0
for (const [id, data] of Object.entries(population)){
    world_pop += data.pop
    if (has_free_modern.includes(id)){
        world_has += data.pop
    }
}
const world_percent = Math.round(world_has / world_pop * 100)


// Generate list of owners
let all_owners = {}
for (const trans of translations){
    // Normalise name as much as possible (as will use for key)
    const name = trans.attribution.replaceAll(/copyright/gi, '').replaceAll(/\(c\)/gi, '')
        .replaceAll(/\d\d\d\d/g, '').replaceAll(/[^\w ]/g, '').replaceAll(/ inc/gi, '')
        .replaceAll(/the /gi, '').trim()
    // Produce key from name
    const key = name.toLowerCase()
    if (! (key in all_owners)){
        all_owners[key] = {name, count: 0}
    }
    all_owners[key].count += 1
}
all_owners = Object.values(all_owners)

// Group owners with only one translation and say couldn't detect properly
// As too many to list, not statistically interesting, and may not have been detected properly...
const owners = all_owners.filter(item => item.count > 1 && item.name)
owners.sort((a, b) => b.count - a.count)
owners.push({name: "* Unable to auto-detect * ", count: all_owners.length - owners.length})


// Generate list of usage situations
const usages = [
    {
        name: "Can use commercially",
        count: per(collection.get_translations({usage: {commercial: true}}).length),
    },
    {
        name: "Attribution not required",
        count: per(collection.get_translations({usage: {attributionless: true}}).length),
    },
    {
        name: "No quotation limits",
        count: per(collection.get_translations({usage: {limitless: true}}).length),
    },
    {
        name: "Can modify",
        count: per(collection.get_translations({usage: {derivatives: true}}).length),
    },
    {
        name: "Can modify if same license",
        count: per(collection.get_translations({usage: {derivatives: 'same-license'}}).length),
    },
]


// Generate list of testaments
const testaments = {
    whole: {
        name: "Whole Bible",
        count: 0,
    },
    nt_plus: {
        name: "NT + some OT",
        count: 0,
    },
    nt_only: {
        name: "NT only",
        count: 0,
    },
    partial: {
        name: "Some books",
        count: 0,
    },
}
for (const trans of translations){
    const completion = collection.get_completion(trans.id)
    if (completion.nt.missing.length){
        testaments.partial.count += 1
    } else if (!completion.ot.missing.length){
        testaments.whole.count += 1
    } else if (!completion.ot.available.length){
        testaments.nt_only.count += 1
    } else {
        testaments.nt_plus.count += 1
    }
}



</script>


<style lang='sass'>
</style>
