
<template lang='pug'>

h1 Statistics
p More information on the Bible translations available.

h2 Books available
table
    tr
        th Testaments
        th Translations
    tr(v-for='item of Object.values(testaments)' :key='item.name')
        td {{ item.name }}
        td {{ per(item.count) }}


h2 Licenses
table
    tr
        th License
        th Translations
    tr(v-for='license of licenses' :key='license.display')
        td {{ license.display }}
        td {{ per(license.count) }}


h2 Restrictions
table
    tr
        th Allows
        th Translations
    tr(v-for='usage of usages' :key='usage.name')
        td {{ usage.name }}
        td {{ usage.count }}


h2 Year of publication
table
    tr
        th Period
        th Translations
    tr(v-for='period of periods' :key='period.display')
        td {{ period.display }}
        td {{ per(period.count) }}


h2 Owner
table
    tr
        th Owner
        th Translations
    tr(v-for='owner of owners' :key='owner.name')
        td {{ owner.name }}
        td {{ owner.count }}
p
    small (This is a rough estimate only)


</template>


<script lang='ts' setup>

import {collection} from './collection'


// Get translations
const translations = collection.bibles.get_resources()


// Util for getting count as a percentage string of total translations
const per = (count:number) => String(Math.floor(count / translations.length * 100)) + '%'


// Generate list of periods
const epoch = 1950
const this_year = new Date().getFullYear()
const decades = [...Array(Math.ceil((this_year - epoch) / 10)).keys()].map(n => {
    const start = n*10 + epoch
    return {
        start,
        end: start + 9,
        display: `${start}s`,
    }
})
decades.reverse()
decades.push({start: 0, end: epoch-1, display: `Pre-${epoch}`})
const periods = decades.map(period => {
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
licenses.push({
    display: "Custom license only",
    count: translations.filter(t => !t.licenses.some(l => l.id)).length,
})


// Generate list of owners
const owners_by_key:Record<string, {name:string, count:number}> = {}
for (const trans of translations){
    // Normalise name as much as possible (as will use for key)
    const name = trans.attribution.replaceAll(/copyright/gi, '').replaceAll(/\(c\)/gi, '')
        .replaceAll(/\d\d\d\d/g, '').replaceAll(/[^\w ]/g, '').replaceAll(/ inc/gi, '')
        .replaceAll(/the /gi, '').trim()
    // Produce key from name
    const key = name.toLowerCase()
    owners_by_key[key] ??= {name, count: 0}
    owners_by_key[key].count += 1
}
const all_owners = Object.values(owners_by_key)

// Group owners with only one translation and say couldn't detect properly
// As too many to list, not statistically interesting, and may not have been detected properly...
const owners = all_owners.filter(item => item.count > 1 && item.name)
owners.sort((a, b) => b.count - a.count)
owners.push({name: "* Unable to auto-detect * ", count: all_owners.length - owners.length})


// Generate list of usage situations
const usages = [
    {
        name: "Can use commercially",
        count: per(collection.bibles.get_resources({usage: {commercial: true}}).length),
    },
    {
        name: "Attribution not required",
        count: per(collection.bibles.get_resources({usage: {attributionless: true}}).length),
    },
    {
        name: "No quotation limits",
        count: per(collection.bibles.get_resources({usage: {limitless: true}}).length),
    },
    {
        name: "Can modify",
        count: per(collection.bibles.get_resources({usage: {derivatives: true}}).length),
    },
    {
        name: "Can modify if same license",
        count: per(collection.bibles.get_resources({usage: {derivatives: 'same-license'}}).length),
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
    const completion = collection.bibles.get_completion(trans.id)
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


<style lang='sass' scoped>
</style>
