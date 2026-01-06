
<template lang='pug'>

v-card(class='mb-4' density='compact' @click='go_to_ref')
    v-card-item
        v-card-title(class='text-subtitle-2 font-weight-bold') {{ ref_title }}
    v-card-text
        div.scripture(v-html='result.contents' :class='direction')

</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {go_to_search_result, state} from '@/services/state'
import {content} from '@/services/content'

import type {SearchResult} from '@gracious.tech/fetch-search'


const props = defineProps<{result:SearchResult}>()


const ref_title = computed(() => {
    return content.collection.bibles.reference_to_string(props.result.ref, state.trans[0])
})


const direction = computed(() => {
    if (props.result.ref.nt || state.hebrew_ltr){
        return 'orig-ltr'
    }
    return 'orig-rtl'
})


const go_to_ref = () => {
    go_to_search_result(props.result)
}


</script>


<style lang='sass' scoped>

.scripture
    line-height: 1.2
    max-height: 250px  // Limit height of results
    font-size: 14px
    @media (min-width: 800px)
        font-size: 15px

    &.orig-ltr :deep(.orig)
        direction: ltr
    &.orig-rtl :deep(.orig)
        direction: rtl

    // Fade out when exceed height by adding gradient to bottom edge
    &::after
        content: ""
        position: absolute
        bottom: 0
        left: 0
        right: 0
        height: 1.5rem
        background: linear-gradient(to bottom, transparent, rgb(var(--v-theme-surface)))

    :deep(mark)
        color: inherit
        background-color: rgb(var(--v-theme-primary), 0.5)

    :deep(.orig)
        margin-bottom: 4px
        font-size: 13px


</style>
