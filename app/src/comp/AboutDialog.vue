
<template lang='pug'>

v-dialog(v-model='state.show_about_dialog' :fullscreen='!state.wide' :max-width='dialog_max_width')

    v-card
        v-toolbar(color='primary' :density='density')
            v-toolbar-title About
            template(#append)
                v-btn(icon variant='text' @click='state.show_about_dialog = false')
                    app-icon(name='close')
        v-card-text
            p(class='my-4') This app is powered by #[a(href='https://fetch.bible' target='_blank') fetch(bible)]


</template>


<script lang='ts' setup>

import {state, density, dialog_max_width} from '@/services/state'

</script>


<style lang='sass' scoped>

.v-toolbar
    flex-grow: 0

</style>
