
<template lang='pug'>

v-toolbar(:density='density')

    v-btn(v-if='state.back' icon @click='back')
        app-icon(name='arrow_back')

    div.ch_display(v-if='state.wide') {{ chapter_display }}
    v-btn.loc(v-else @click='state.show_select_chapter = true')
        | {{ chapter_display }}

    v-btn(@click='state.show_trans_dialog = true') {{ trans_display }}

    div(style='flex-grow: 1')

    div.status {{ state.status }}

    div(style='flex-grow: 1')

    v-btn(v-if='state.button1_icon' icon @click='button1')
        svg(viewBox='0 0 48 48' width='24' height='24')
            path(:d='state.button1_icon' :fill='state.button1_color || "currentColor"')
    //- v-btn(icon @click='state.search = state.search === null ? "" : null')
    //-     app-icon(name='search')
    v-btn(icon)
        app-icon(name='more_vert')
        v-menu(activator='parent')
            v-list
                v-list-item(@click='state.show_style_dialog = true')
                    template(#prepend)
                        app-icon.menu_icon(name='format_size')
                    v-list-item-title Appearance
                v-list-item(@click='state.show_about_dialog = true')
                    template(#prepend)
                        app-icon.menu_icon(name='info')
                    v-list-item-title About


</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {density, state} from '@/services/state'
import {content} from '@/services/content'
import {chapter_display} from '@/services/computes'
import {post_message} from '@/services/post'


const trans_display = computed(() => {
    return state.trans.map(id => content.translations[id]!.name_abbrev).join(' / ')
})

const back = () => {
    post_message('back')
}

const button1 = () => {
    post_message('button1')
}


</script>


<style lang='sass' scoped>

.loc
    opacity: 1  // Don't make transparent, even when disabled
    // Don't squish other buttons
    flex-basis: 0
    flex-grow: 999
    max-width: 150px
    overflow: hidden
    justify-content: flex-start

.ch_display
    font-weight: bold
    margin-left: 24px
    margin-right: 12px

.menu_icon
    margin-right: 12px

.status
    opacity: 0.8
    font-size: 0.85em
    overflow-x: hidden  // Don't push buttons off page

</style>
