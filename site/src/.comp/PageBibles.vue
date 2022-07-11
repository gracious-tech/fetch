
<template lang='pug'>

h1 Bible translations available ({{ unfiltered_total }})

p
    | This is a list of all the Bible translations currently available.
    | We regularly check for new translations and updates.
    | If you cannot find a particular translation it is probably a
    | <a href='/content/'>restricted translation</a>.

p
    select(v-model='language')
        option(value='' label="All languages")
        option(v-for='lang of languages' :value='lang.value' :label='lang.label')
p
    input(v-model='exclude_obsolete' id='exclude_obsolete' type='checkbox')
    label(for='exclude_obsolete') Hide obsolete (very old + better available)

details
    summary Filter by allowed usage
    input(v-model='usage_commercial' id='usage_commercial' type='checkbox')
    label(for='usage_commercial') Commercial
    input(v-model='usage_limitless' id='usage_limitless' type='checkbox')
    label(for='usage_limitless') No quotation limits
    input(v-model='usage_attributionless' id='usage_attributionless' type='checkbox')
    label(for='usage_attributionless') Attributionless
    select(v-model='usage_derivatives')
        option(value='') No derivatives
        option(value='same-license') Derivatives (same license)
        option(value='yes') Derivatives

table
    tr
        th(colspan='5') Showing {{ bibles.length }} translation{{ bibles.length === 1 ? '' : 's'}}
    tr
        th Name
        th Lang
        th Year
        th Books
        th Licenses
    tr(v-for='bible of bibles')
        td
            //- TODO Point to web app
            a(href='/access/client-example/' target='_blank')
                | {{ bible.name_english || bible.name_local }}
        td
            a(@click='language = bible.language') {{ bible.language }}
        td {{ bible.year }}
        td(v-html='bible.completion')
        td
            template(v-for='license of bible.licenses')
                a(:href='license.url' target='_blank') {{ license.id ?? 'Custom' }}
                br

</template>


<script setup>

import {ref, computed} from 'vue'

import {BibleClient} from './client.min.esm.js'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Get collection
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()


// Expose total number of translations before filtering
const unfiltered_total = Object.keys(collection._manifest.translations).length


// Get list of languages for <select> filter
const languages = collection.get_languages().map(lang => {
    return {
        value: lang.code,
        label: `${lang.local} (${lang.english})`,
    }
})


// Init language to hash if any (so can link directly to a language's translations)
const hash = self.location.hash.slice(1)
const language = ref(languages.map(l => l.value).includes(hash) ? hash : '')


// Init filters to showing max possible
const usage_commercial = ref(false)
const usage_limitless = ref(false)
const usage_attributionless = ref(false)
const usage_derivatives = ref('')
const exclude_obsolete = ref(false)


// Expose bibles list
const bibles = computed(() => {
    return collection.get_translations({
        language: language.value,
        sort_by_year: true,
        usage: {
            commercial: usage_commercial.value,
            limitless: usage_limitless.value,
            attributionless: usage_attributionless.value,
            derivatives: usage_derivatives.value,
        },
        exclude_obsolete: exclude_obsolete.value,
    }).map(trans => {
        const completion = collection.get_completion(trans.id)
        let comp_str = "100%"
        if (completion.ot.missing.length || completion.nt.missing.length){
            const ot_p = Math.floor(completion.ot.available.length /
                (completion.ot.available.length + completion.ot.missing.length) * 100)
            const nt_p = Math.floor(completion.nt.available.length /
                (completion.nt.available.length + completion.nt.missing.length) * 100)
            comp_str = `OT ${ot_p}%<br>NT ${nt_p}%`
        }
        return {...trans, completion: comp_str}
    })
})


</script>


<style lang='sass' scoped>

a, summary, select, input, label
    cursor: pointer

select
    padding: 2px 8px
    margin-left: 12px
    border-radius: 4px

label, select
    margin: 8px 18px 8px 4px
    user-select: none

</style>
