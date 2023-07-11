---
layout: home
sidebar: false
titleTemplate: fetch(bible)

hero:
    name: fetch(bible)
    text: Digital access to Bible translations
    tagline: Free / Private / Open source
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

---


<script lang='ts' setup>

// A mini component for including the number of translations available
// NOTE `setup` turns this into a component so DOM is ready when insertion is attempted

import {onMounted} from 'vue'

import {collection} from '@/_comp/collection'


onMounted(async () => {

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
