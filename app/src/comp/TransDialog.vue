
<template lang='pug'>

v-dialog(v-model='state.show_trans_dialog' :fullscreen='!state.wide' :max-width='dialog_max_width'
        max-height='1000px' height='100%')

    v-card(height='100%')

        v-tabs(v-model='selected_trans_index' color='' bg-color='primary')
            v-tab(v-for='(item, i) of chosen_translations' :key='item.id + i')
                div.abbrev {{ item.name_abbrev }}
                v-btn.remove(v-if='chosen_translations.length > 1' icon variant='text' color=''
                        @click.stop='remove_trans(i)')
                    app-icon(name='close_small')
            v-btn.add(v-if='edited_trans.length < 3' icon variant='text' color=''
                    @click='add_trans')
                app-icon(name='add_circle_fill')
            div.close
                v-btn(icon variant='text' @click='confirm_changes' color='')
                    app-icon(name='close')

        div.subbar
            v-text-field.search(v-if='show_languages' v-model='languages_search' variant='outlined'
                type='search' placeholder="Search..." density='compact' hide-details single-line)
            v-btn(v-else color='primary' variant='text' @click='show_languages = true')
                app-icon(name='arrow_back' style='margin-right: 12px')
                | {{ displayed_language_name }}

        v-list(v-if='show_languages' ref='lang_list_comp')
            v-list-item(v-for='lang of languages_filtered' :key='lang.id' density='compact'
                    @click='change_lang(lang)')
                v-list-item-title {{ lang.name_bilingual }}
            v-btn(v-if='!languages_search && !languages_show_all' variant='text' color='primary'
                    @click='languages_show_all = true')
                app-icon(name='expand_circle_down')
                | &nbsp;
                | + {{ languages.length - languages_filtered.length }}
        v-list(v-else)
            template(v-for='trans of translations')
                v-list-subheader(v-if='typeof trans === "string"' :key='trans' class='mt-4')
                    | {{ trans }}
                v-list-item(v-else :key='trans.id' color='primary'
                        :active='trans.id === selected_trans.id' density='compact'
                        @click='confirm_trans(trans.id)')
                    v-list-item-title
                        | {{ trans.name_abbrev }} &mdash; {{ trans.name }}
                    v-list-item-subtitle(v-if='trans.name_english !== trans.name')
                        | {{ trans.name_english }}

</template>


<script lang='ts' setup>

import {computed, onUnmounted, reactive, ref, watch} from 'vue'

import {state, dialog_max_width} from '@/services/state'
import {content} from '@/services/content'

import type {GetLanguagesItem, GetResourcesItem} from '@gracious.tech/fetch-client'


// Contants
// NOTE Languages with Bibles in two scripts (e.g. Chinese) are listed once per script
const languages = content.collection.bibles.get_languages({split_scripts: true})
// NOTE Just show 10 initially as scanning too many wastes time since not initially in ABC order
const languages_by_pop = content.collection.bibles.get_languages({sort_by: 'population',
    split_scripts: true}).slice(0, 10)


// Get the language list item for a translation (distinguishing script if language has multiple)
const trans_language = (id:string):GetLanguagesItem => {
    const trans = content.translations[id]!
    return content.collection.bibles.get_language(trans.language, trans.script)!
}


// State
// NOTE Don't apply changes until dialog closed to prevent laggy UI
const edited_trans = reactive([...state.trans] as [string, ...string[]])
const selected_trans_index = ref(0)
const show_languages = ref(false)
const displayed_language = ref(trans_language(edited_trans[0]))
const languages_search = ref('')
const languages_show_all = ref(false)
const lang_list_comp = ref<{$el: HTMLElement}>()


// Computes
const chosen_translations = computed(() => edited_trans.map(id => content.translations[id]!))
const selected_trans = computed(() => chosen_translations.value[selected_trans_index.value]!)
const displayed_language_name = computed(() => displayed_language.value.name_local)
const languages_filtered = computed(() => {
    if (languages_search.value){
        return content.collection.bibles.get_languages({search: languages_search.value,
            split_scripts: true})
    }
    return languages_show_all.value ? languages : languages_by_pop
})

const translations = computed(() => {

    // Get translations by category
    const {code, script} = displayed_language.value
    const filter = {language: code, script}
    const decent = content.collection.bibles.get_resources({...filter, exclude_obsolete: true})
    const niche = content.collection.bibles.get_resources(filter)
        .filter(i => !decent.find(di => di.id === i.id))

    // Add in separate groups
    const items:(GetResourcesItem|string)[] = decent
    if (niche.length){
        items.push("Historical & Niche Translations")
        items.push(...niche)
    }
    return items
})

// Access to translation choices while excluding headings
const translations_selectable = computed(() => {
    return translations.value.filter(t => typeof t !== 'string')
})


// Watches
watch(selected_trans_index, () => {
    displayed_language.value = trans_language(edited_trans[selected_trans_index.value]!)
    show_languages.value = false
})
watch(languages_show_all, () => {
    // Scroll back to top of lang list when showing all, as new items will be added to top
    lang_list_comp.value?.$el.scroll({top: 0})
})


// Methods

const change_lang = (lang:GetLanguagesItem) => {
    displayed_language.value = lang
    if (translations_selectable.value.length === 1){
        confirm_trans(translations_selectable.value[0]!.id)
    }
    show_languages.value = false
}

const confirm_trans = (id:string) => {
    edited_trans[selected_trans_index.value] = id
    confirm_changes()
}

const add_trans = () => {
    edited_trans.push(edited_trans[edited_trans.length-1]!)
    selected_trans_index.value = edited_trans.length - 1
}

const remove_trans = (i:number) => {
    edited_trans.splice(i, 1)
    if (selected_trans_index.value >= edited_trans.length){
        selected_trans_index.value = edited_trans.length - 1
    }
}


const confirm_changes = () => {
    // Closing dialog always applies changes
    state.show_trans_dialog = false
}


onUnmounted(() => {
    // Always apply changes, however the dialog is closed
    // NOTE Slight delay so dialog animation closes instead of lagging
    setTimeout(() => {
        // Only trigger DOM update if actually changed something
        if (state.trans.join(' ') !== edited_trans.join(' ')){
            state.trans = [...edited_trans] as [string, ...string[]]
        }
    }, 10)
})


</script>


<style lang='sass' scoped>

.subbar
    display: flex
    align-items: center
    justify-content: space-between
    padding: 12px 0

    .v-text-field
        margin: 0 12px

.v-tabs
    min-height: var(--v-tabs-height)  // Safari bug fix

.v-tab
    padding-right: 0  // So remove button can go right to edge
    grid-template-columns: 0 1fr 0  // Override Vuetify to allow contents to grow
    flex-grow: 1  // Grow width of tab
    max-width: 250px  // Don't let tabs grow too big
    border-right: 1px solid #fff5  // Make clear which tab remove buttons belong to
    border-radius: 0 !important

    &.v-tab--selected
        background-color: #fff3  // So more obvious which one is selected

    .abbrev
        text-align: center
        flex-grow: 1  // So remove button pushed to right edge of tab

    &:not(:hover)
        .remove
            opacity: 0.5

.close
    margin-left: auto  // Move to end of navbar
    // Don't let last tab's remove button get too close to diaglog close button to avoid confusion
    padding-left: 24px
    @media (min-width: 1000px)
        padding-left: 48px

</style>
