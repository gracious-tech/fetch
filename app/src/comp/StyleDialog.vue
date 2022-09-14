
<template lang='pug'>

v-dialog(v-model='state.show_style_dialog' :fullscreen='!state.wide')

    v-card

        v-toolbar(color='primary' :density='density')
            v-toolbar-title Appearance
            template(#append)
                v-btn(icon variant='text' @click='state.show_style_dialog = false')
                    app-icon(name='close')

        v-card-text

            div.row
                app-icon(name='light_mode')
                v-switch.theme(v-model='state.dark' hide-details)
                app-icon(name='dark_mode')


</template>


<script lang='ts' setup>

import {state, density} from '@/services/state'

</script>


<style lang='sass' scoped>

.v-dialog
    // Don't take up full height on mobile so can see changes to text below
    max-height: 60%
    margin-top: 0

.v-toolbar
    flex-grow: 0

.row
    display: flex
    align-items: center
    justify-content: flex-start

    .v-switch
        flex-grow: 0
        margin: 0 12px

        &.theme :deep(.v-switch__thumb)
            color: rgb(var(--v-theme-primary))

</style>
