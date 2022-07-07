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
        details: Full access to the whole collection of Bibles with no signup, no usage restrictions, and no tracking
    -   icon: ⚡️
        title: Integrate at any level
        details: Choose between an official UI, API, or manual access
---


<script lang='ts' setup>

// A mini component for including the number of translations available
// NOTE `setup` turns this into a component so DOM is ready when insertion is attempted


// Use localhost endpoint during dev
const endpoint = import.meta.env.PROD ? 'https://collection.fetch.bible/' : 'http://localhost:8430/'


// Import client and get collection
const {BibleClient} = await import(location.origin + '/client.min.esm.js')
const client = new BibleClient({endpoints: [endpoint]})
const collection = await client.fetch_collection()


// Progressively count up to total translations available
const total = collection.get_translations().length
let counter = 0
while (counter < total){
    await new Promise(resolve => setTimeout(resolve, 1))
    counter = Math.min(total, counter+2)
    // Replace the existing hero `text` with number included
    self.document.body.querySelector('.VPHomeHero .text').innerText =
        `Digital access to ${counter}+ Bible translations`
}


</script>
