
<template lang='pug'>

v-chip.crossref(:class='link.category' rounded='lg' size='small' @click='go_to_ref')
    span.inner
        span.category {{ category_label }}
        span.reference {{ label }}

</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {change_to_ref, state, add_to_read_history} from '@/services/state'

import type {CrossrefCategory, CrossrefLink} from '@gracious.tech/fetch-client'


const props = defineProps<{link:CrossrefLink}>()


// Short label naming the kind of connection, shown above the reference
// NOTE Worded by direction: [when the reference is the earlier original, when it is later]
const CATEGORY_LABELS:Record<CrossrefCategory, [string, string]> = {
    quotation: ["quotes", "quoted in"],
    parallel: ["parallel", "parallel"],
    allusion: ["echoes", "echoed in"],
    mention: ["mentions", "mentioned in"],
    relevant: ["related", "related"],
}
const category_label = computed(() => {
    const [to_earlier, to_later] = CATEGORY_LABELS[props.link.category]
    return props.link.target_is_earlier ? to_earlier : to_later
})


// The passage being linked to
const label = computed(() => {
    return props.link.target.toString(state.book_names)
})


// Navigate to the linked passage, remembering where the user came from
const go_to_ref = () => {
    add_to_read_history(state.study!)  // First save study verse that user is navigating from
    add_to_read_history(props.link.target)
    change_to_ref(props.link.target)
}

</script>


<style lang='sass' scoped>

// Let the chip grow to fit two lines (label above reference) in one shared background
.crossref
    height: auto
    padding-top: 4px
    padding-bottom: 4px

.inner
    display: flex
    flex-direction: column
    align-items: center
    line-height: 1.2

.category
    font-size: 0.7rem
    font-weight: 500
    opacity: 0.65

// Hue per category so kinds of connection can be told apart at a glance
// NOTE "relevant" keeps the default chip colors as the weakest kind of link
$category_hues: (quotation: 215, parallel: 170, allusion: 275, mention: 35)

// Faint tinted background with a label in a deep shade of the same hue
@each $category, $hue in $category_hues
    .#{$category}
        background-color: hsl($hue, 55%, 92%)
        .category
            color: hsl($hue, 50%, 32%)
            opacity: 1

    // Inverted for dark backgrounds: deep tinted background with a pale label
    .v-theme--dark .#{$category}
        background-color: hsl($hue, 30%, 22%)
        .category
            color: hsl($hue, 50%, 78%)

</style>
