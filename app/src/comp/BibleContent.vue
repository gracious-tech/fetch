
<template lang='pug'>

div.offline(v-if='state.offline')
    app-icon.cloud(name='cloud_off')
    v-btn(icon color='primary' @click='retry')
        app-icon(name='sync')


ContentInstance(v-else-if='state.content || state.content_verses.length')

div.loading(v-else)
    svg.loading(viewBox='0 0 100 100' preserveAspectRatio='xMidYMid meet')
        circle(cx='50' cy='50' r='40' stroke-width='10' stroke-dasharray='190')

</template>


<script lang='ts' setup>

import ContentInstance from './ContentInstance.vue'
import {state} from '@/services/state'


const retry = () => {
    // Trigger watch
    state.trans = [...state.trans]
}

</script>


<style lang='sass' scoped>

.offline
    display: flex
    flex-direction: column
    align-items: center
    justify-content: flex-start
    padding-top: 10vh

    .cloud
        width: 50vw
        height: 50vw
        opacity: 0.3

.loading
    display: flex
    align-items: center
    justify-content: center

</style>
