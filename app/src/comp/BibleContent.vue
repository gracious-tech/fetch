
<template lang='pug'>

ContentInstance(v-if='state.content || state.content_verses.length')

div.loading(v-else)
    svg.loading(viewBox='0 0 100 100' preserveAspectRatio='xMidYMid meet')
        circle(cx='50' cy='50' r='40' stroke-width='10' stroke-dasharray='190')

</template>


<script lang='ts' setup>

import ContentInstance from './ContentInstance.vue'
import {state} from '@/services/state'


</script>


<style lang='sass' scoped>

.loading
    display: flex
    align-items: center
    justify-content: center

</style>
