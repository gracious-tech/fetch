
<template lang='pug'>

v-app(:class='{wide: state.wide}')

    //- Show book menu in drawer for narrow screens
    //- NOTE touchless disables swiping right from screen edge to open (conflicts with prev ch)
    v-navigation-drawer(v-if='!state.wide' v-model='state.show_select_chapter' temporary touchless
            width='450')
        template(#prepend)
            v-toolbar(color='primary' density='compact')
                v-toolbar-title {{ chapter_display }}
                v-btn(icon variant='text' @click='state.show_select_chapter = false')
                    app-icon(name='close')
        BookMenu

    v-main
        AppToolbar.toolbar(v-if='state.wide || state.search === null')
        div.layout

            //- Show book menu on side if screen wide enough
            BookMenu.side_menu(v-if='state.wide')

            div.primary
                SearchToolbar.search(v-if='state.search !== null')
                BibleContent.content

TransDialog(v-if='state.show_trans_dialog')

</template>


<script lang='ts' setup>

import {watch} from 'vue'
import {useTheme} from 'vuetify'

import BookMenu from './BookMenu.vue'
import BibleContent from './BibleContent.vue'
import AppToolbar from './AppToolbar.vue'
import SearchToolbar from './SearchToolbar.vue'
import TransDialog from './TransDialog.vue'
import {state} from '@/services/state'
import {chapter_display} from '@/services/computes'


const theme = useTheme()

// Update Vuetify and bg whenever color config changes
// NOTE Done here since `useTheme` can only be called within a setup fn
watch(() => state.color, value => {
    theme.themes.value['dark']!.colors.primary = value
    self.document.body.parentElement!.style.backgroundColor = value
}, {immediate: true})

</script>


<style lang='sass' scoped>

.v-application
    height: 100%
    width: 100%

    // Max-out width eventually so not TOO wide and add margin
    &.wide
        max-width: 1400px
        @media (min-width: 1400px)
            margin: 20px auto

    :deep(.v-application__wrap)
        min-height: auto  // Override Vuetify 100vh

        .v-main
            display: flex
            flex-direction: column
            height: 100%

            .toolbar
                flex-grow: 0  // Don't exceed desired height

            .layout
                display: flex
                overflow: hidden
                flex-grow: 1
                flex-basis: 0  // Don't crush toolbar

                .side_menu
                    min-width: 450px  // Keep same as drawer width above
                    max-width: 450px
                    overflow-y: auto
                    overflow-x: hidden

                .primary
                    display: flex
                    flex-direction: column
                    width: 100%

                    .search
                        flex-grow: 0  // Override Vuetify to stop expanding beyond own height

                    .content
                        flex-basis: 0  // So don't crush toolbar
                        flex-grow: 1
                        overflow-y: auto
                        overflow-x: hidden
                        overflow-wrap: anywhere


</style>
