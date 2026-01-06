
<template lang='pug'>

v-toolbar(:density='density')

    //- autocomplete=off tells browser not to show its own suggestions which would overlap own
    v-combobox.input(ref='combobox' v-model='search_value' hide-details autocomplete='off'
            density='compact' variant='outlined' autofocus :items='state.search_history'
            :multiple='orig_mode' :chips='orig_mode' :readonly='orig_mode' @keydown.enter='enter')
        template(#prepend-inner)
            app-icon.placeholder(v-if='!state.search' name='search')
        template(v-if='orig_mode' #chip='chip_props')
            v-chip(@click='remove(chip_props.index)' rounded) {{ chip_props.item.value }}
        template(#append-inner)
            v-btn(v-if='state.search || state.search_orig' @click='clear_search' icon size='small')
                app-icon(name='close' small)

    v-btn-toggle.filter(v-model='search_filter' color='primary' density='compact'
            :class='{"mr-2": state.wide}')
        v-btn(size='x-small' value='ot') Old
        v-btn(size='x-small' value='nt') New
        v-btn(size='x-small' value='book') {{ current_book_abbrev }}
    v-btn(v-if='!state.wide' icon variant='text' @click='state.show_nav = false')
        app-icon(name='close')

</template>


<script lang='ts' setup>

import {computed, useTemplateRef} from 'vue'

import {density, filtered_results, go_to_search_result, state} from '@/services/state'
import {current_book_abbrev} from '@/services/computes'

import type {VCombobox} from 'vuetify/lib/components'


const comboxbox = useTemplateRef<VCombobox>('combobox')


const orig_mode = computed(() => !!state.search_orig)


const search_value = computed({
    get(){
        // Return string if normal search, otherwise array of strings
        const prop = state.original_chars ? 'original' : 'word'
        return state.search_orig ? state.search_orig.words.map(w => w[prop]) : state.search
    },
    set(value:string){
        // NOTE Cannot edit search_orig, can only clear words or whole search
        if (!state.search_orig){
            state.search = value
        }
    },
})


// Proxy so save null rather than undefined
const search_filter = computed({
    get(){
        return state.search_filter
    },
    set(value:'ot'|'nt'|'book'|undefined){
        state.search_filter = value ?? null
    },
})


const clear_search = () => {
    state.search = ""
    state.search_orig = null
    // Ensure don't start showing search suggestions if box still has focus
    comboxbox.value?.blur()
}

const remove = (i:number) => {
    // Only used for search_orig
    if (state.search_orig){
        state.search_orig.words.splice(i, 1)
        if (!state.search_orig.words.length){
            state.search_orig = null
        }
    }
}

const enter = () => {
    if (filtered_results.value.length){
        go_to_search_result(filtered_results.value[0]!)
    }
}

</script>


<style lang='sass' scoped>

.input
    margin: 0 8px

    :deep(.v-field)
        padding-right: 0 !important

    :deep(.v-field__prepend-inner)  // Container of search icon placeholder
        pointer-events: none

    :deep(.v-combobox__menu-icon)
        display: none  // Hide Vuetify's dropdown button that comes with combobox

.placeholder
    opacity: 0.5

.v-toolbar__content > .v-btn:last-child
    margin-inline-end: 0  // Override Vuetify

.filter
    flex-shrink: 0

</style>
