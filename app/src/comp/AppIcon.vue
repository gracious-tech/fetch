
<template lang='pug'>

component.icon(:is='icons[name]' viewBox='0 0 48 48')

</template>


<script lang='ts' setup>

import type {FunctionalComponent} from 'vue'

import add from '@material-symbols/svg-400/outlined/add.svg?component'
import add_circle from '@material-symbols/svg-400/outlined/add_circle.svg?component'
import delete_ from '@material-symbols/svg-400/outlined/delete.svg?component'
import close from '@material-symbols/svg-400/outlined/close.svg?component'
import search from '@material-symbols/svg-400/outlined/search.svg?component'
import more_vert from '@material-symbols/svg-400/outlined/more_vert.svg?component'
import arrow_back from '@material-symbols/svg-400/outlined/arrow_back.svg?component'
import expand_more from '@material-symbols/svg-400/outlined/expand_more.svg?component'


defineProps({
    name: {required: true, type: String},
})


const icons = {
    close, search, more_vert, add, delete: delete_, arrow_back, add_circle, expand_more,
} as Record<string, FunctionalComponent>


</script>


<style lang='sass'>


.icon
    height: 24px
    width: 24px
    fill: currentColor


</style>
