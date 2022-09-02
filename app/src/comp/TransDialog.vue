
<template lang='pug'>

v-dialog(v-model='state.show_trans_dialog' :fullscreen='!state.wide')

    v-card

        v-tabs(v-model='selected_trans_index' background-color='primary')
            //- eslint-disable-next-line vue/valid-v-for
            v-tab(v-for='item of chosen_translations') {{ item.name_abbrev }}
            v-btn.add(icon variant='text' @click='add_trans')
                app-icon(name='add_circle')
            v-btn.close(icon variant='text' @click='state.show_trans_dialog = false')
                app-icon(name='close')

        div.subbar
            v-text-field.search(v-if='show_languages' variant='outlined' density='compact'
                type='search' placeholder="Search..." hide-details single-line
                @input='search_input')
            v-btn(v-else color='primary' variant='text' @click='show_languages = true')
                app-icon(name='arrow_back' style='margin-right: 12px')
                | {{ displayed_language_name }}
            v-btn(v-if='chosen_translations.length > 1' icon color='error' variant='text'
                    @click='remove_trans')
                app-icon(name='delete')

        v-list(v-if='show_languages')
            v-list-item(v-for='lang of languages' :key='lang.code' density='compact'
                    @click='change_lang(lang.code)')
                v-list-item-title
                    | {{ lang.local }}
                    |
                    template(v-if='lang.local !== lang.english') ({{ lang.english }})
        v-list(v-else)
            v-list-item(v-for='trans of translations' :key='trans.id' active-color='primary'
                    :active='trans.id === selected_trans.id' density='compact'
                    @click='change_trans(trans.id)')
                v-list-item-title
                    | {{ trans.name_abbrev }} &mdash; {{ trans.name_local || trans.name_english }}

</template>


<script lang='ts' setup>

import {computed, ref, watch} from 'vue'

import {state} from '@/services/state'
import {content} from '@/services/content'


// State
const selected_trans_index = ref(0)
const show_languages = ref(false)
const displayed_language = ref('eng')
const languages = ref(content.collection.get_languages())  // Ref since may filter


// Computes
const chosen_translations = computed(() => state.trans.map(id => content.translations[id]!))
const selected_trans = computed(() => chosen_translations.value[selected_trans_index.value]!)
const displayed_language_name = computed(() => {
    return content.languages[displayed_language.value]!.local
})
const translations = computed(() => {
    return content.collection.get_translations({language: displayed_language.value})
})


// Watches
watch(selected_trans_index, () => {
    displayed_language.value = chosen_translations.value[selected_trans_index.value]!.language
    show_languages.value = false
})


// Methods
const search_input = (event:Event) => {
    const input = (event.target as HTMLInputElement).value
    languages.value = content.collection.get_languages({search: input})
}

const change_lang = (code:string) => {
    displayed_language.value = code
    if (translations.value.length === 1){
        change_trans(translations.value[0]!.id)
    }
    show_languages.value = false
}

const change_trans = (id:string) => {
    state.trans[selected_trans_index.value] = id
    state.show_trans_dialog = false
}

const add_trans = () => {
    state.trans.push(state.trans.at(-1)!)
    selected_trans_index.value = state.trans.length - 1
}

const remove_trans = () => {
    state.trans.splice(selected_trans_index.value, 1)
    if (selected_trans_index.value >= state.trans.length){
        selected_trans_index.value = state.trans.length - 1
    }
}


</script>


<style lang='sass'>

.subbar
    display: flex
    align-items: center
    justify-content: space-between
    padding: 12px 0

    .v-text-field
        margin: 0 12px

.close
    margin-left: auto

</style>
