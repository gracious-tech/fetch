
<template lang='pug'>

v-toolbar(color='primary' :density='state.wide ? "default" : "compact"')
    v-btn.loc(:disabled='state.wide' @click='state.show_select_chapter = true')
        | {{ chapter_display }}
    v-btn(@click='state.show_trans_dialog = true') {{ trans_display }}
    template(#append)
        //- v-btn(icon @click='state.search = state.search === null ? "" : null')
        //-     app-icon(name='search')
        v-btn(icon)
            app-icon(name='more_vert')

</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {state} from '@/services/state'
import {content} from '@/services/content'
import {chapter_display} from '@/services/computes'


const trans_display = computed(() => {
    return state.trans.map(id => content.translations[id]!.name_abbrev).join(' / ')
})


</script>


<style lang='sass' scoped>

.loc
    opacity: 1  // Don't make transparent, even when disabled

</style>
