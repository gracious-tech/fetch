---
layout: home
sidebar: false
titleTemplate: fetch(bible)

hero:
    name: fetch(bible)
    text: Digital access to Bible translations
    tagline: Free and unrestricted
    actions:
        -   theme: brand
            text: Overview
            link: /overview/
        -   theme: alt
            text: What's included
            link: /content/
        -   theme: alt
            text: How to access
            link: /access/

features:
    -   icon: ∞
        title: Limitless use
        details: Full access to the whole collection of Bibles with no signup, no request limits, and no tracking
    -   icon: ⚡️
        title: Integrate at any level
        details: Choose between an official UI, API, or manual access
---


<script lang='ts' setup>

// A mini component for including the number of translations available
// NOTE `setup` turns this into a component so DOM is ready when insertion is attempted

import {onMounted} from 'vue'

import {BibleClient} from './.comp/client.min.esm.js'


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


onMounted(async () => {

    // Get collection
    const client = new BibleClient({endpoints: [endpoint]})
    const collection = await client.fetch_collection()

    // Progressively count up to total translations available
    const total = collection.get_translations().length
    let counter = 0
    while (counter < total){
        await new Promise(resolve => setTimeout(resolve, 1))
        counter = Math.min(total, counter+2)
        // Replace the existing hero `text` with number included
        self.document.body.querySelector('.VPHomeHero .text').innerHTML =
            `Digital access to ${counter}+<br>Bible translations`
    }
})

</script>
