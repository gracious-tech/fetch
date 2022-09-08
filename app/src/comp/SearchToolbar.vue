
<template lang='pug'>

v-toolbar(:density='density')
    v-text-field.input(v-model='state.search' placeholder="Search..." hide-details density='compact'
        variant='outlined')

    template(#append)
        v-btn-toggle(color='secondary' density='compact')
            v-btn {{ book_display }}
            v-btn OT
            v-btn NT
            v-btn All
        v-btn(icon @click='state.search = null')
            app-icon(name='close')

</template>


<script lang='ts' setup>


import {density, state} from '@/services/state'
import {book_display} from '@/services/computes'


</script>


<style lang='sass' scoped>

.input
    margin: 8px

</style>
