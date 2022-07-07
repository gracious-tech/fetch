
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


h2 Owner
table
    tr
        th Owner
        th Translations
    tr(v-for='owner of owners')
        td {{ owner.name }}
        td {{ owner.count }}


h2 Year of publication
table
    tr
        th Period
        th Translations
    tr(v-for='period of periods')
        td {{ period.display }}
        td {{ per(period.count) }}


h2 No free modern translation
p The top 20 most commonly used languages that do not have a Bible translation that is modern (published after {{ modern_year }}) and free (no quotation limits).
table
    tr
        th Code
        th English
        th Autonym
        th Population
    tr(v-for='lang of missing_languages')
        td {{ lang.id }}
        td {{ lang.english }}
        td {{ lang.local }}
        td {{ lang.pop }}


</template>


<script setup>


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Import client and get translations
const {BibleClient} = await import(location.origin + '/client.min.esm.js')
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()
const translations = collection.get_translations()


// Util for getting count as a percentage string of total translations
const per = count => Math.floor(count / translations.length * 100) + '%'


// Import population data
const population = await (await fetch('/population.json')).json()


// Generate list of periods
const this_year = new Date().getFullYear()
let periods = [...Array(Math.ceil((this_year - 1900) / 10)).keys()].map(n => {
    const start = n*10 + 1900
    return {
        start,
        end: start + 9,
        display: `${start}s`,
    }
})
periods.reverse()
periods.push({start: 0, end: 1899, display: "Pre-1900"})
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
    return collection.get_translations({language: lang, usage: {limitless: true}})
        .some(t => t.year >= modern_year)
})
const missing_languages = population.filter(item => !has_free_modern.includes(item.id)).slice(0, 20)
    .map(item => {
        const mil = Math.round(item.pop / 1000000).toLocaleString()
        return {...item, pop: `${mil} million`}
    })


// Generate list of owners
// NOTE Determines owner by attribution url (may need to improve in future)
let owners = {}
for (const trans of translations){
    const domain = new URL(trans.attribution_url).hostname
    console.log(domain)
    if (! (domain in owners)){
        owners[domain] = {name: trans.attribution, count: 0}
    }
    owners[domain].count += 1
}
owners = Object.values(owners)
owners.sort((a, b) => b.count - a.count)


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
