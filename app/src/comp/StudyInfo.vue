
<template lang='pug'>

div.pane(v-if='state.study' class='pa-4')
    h3
        span.ref(@click='return_to_verse') {{ verse_label }}
        v-btn.close(icon variant='flat' @click='state.study = null')
            app-icon(name='close')
    template(v-if='notes')
        h5 Notes
        div.notes(ref='notes_div' class='text-body-2' v-html='notes')
    template(v-if='crossrefs.length')
        h5(class='mb-2') Cross references
        template(v-for='crossref of crossrefs' :key='crossref.label')
            v-chip(class='mr-2 mb-2' size='small' @click='crossref.view') {{ crossref.label }}

</template>


<script lang='ts' setup>

import {computed, watch, ref, nextTick} from 'vue'

import {passage_obj_to_str} from '@gracious.tech/fetch-client'

import {change_passage, state} from '@/services/state'
import {book_names} from '@/services/computes'


const verse_label = computed(() => {
    if (!state.study){
        return ''
    }
    const [book, chapter, verse] = state.study
    return `${book_names.value[book]!} ${chapter}:${verse}`
})


// WARN Using watch instead of compute so that only updated when `study` changes
// Otherwise `state.crossref` will refer to the wrong book since study is disconnected from main
const crossrefs = ref<{label:string, view:()=>void}[]>([])
watch(() => state.study, () => {
    if (!state.study || !state.crossref){
        crossrefs.value = []
        return
    }
    crossrefs.value = state.crossref.get_refs(state.study[1], state.study[2]).map(crossref => {
        return {
            label: `${book_names.value[crossref.book]!} ${passage_obj_to_str(crossref)!}`,
            view(){
                change_passage(crossref.book, crossref.chapter_start,
                    crossref.verse_start ?? undefined)
            },
        }
    })
}, {immediate: true})


// WARN Using watch instead of compute so that only updated when `study` changes
const notes = ref<string|undefined>('')
const notes_div = ref<HTMLDivElement>()
watch(() => state.study, () => {
    if (!state.notes || !state.study){
        notes.value = undefined
        return
    }
    notes.value = state.notes[state.study[1]]?.[state.study[2]]
    // Make all passage references in notes clickable
    void nextTick(() => {
        for (const ref_span of notes_div.value?.querySelectorAll('span[data-ref]') ?? []){
            ref_span.addEventListener('click', event => {
                const [book, ch, v] =
                    (event.target as HTMLDivElement).dataset['ref']?.split(',') ?? []
                if (book){
                    change_passage(book, ch ? parseInt(ch) : undefined, v ? parseInt(v) : undefined)
                }
            })
        }
    })

}, {immediate: true})


const return_to_verse = () => {
    const [book, chapter, verse] = state.study!
    change_passage(book, chapter, verse)
}


</script>


<style lang='sass' scoped>

.pane
    background-color: rgb(var(--v-theme-surface))
    border: 1px solid rgb(var(--v-border-color), var(--v-border-opacity))

h3
    display: flex
    justify-content: space-between

.ref
    cursor: pointer

.close
    position: fixed
    right: 4px
    margin-top: -12px

.notes :deep() span[data-ref]
    color: rgb(var(--v-theme-primary))
    cursor: pointer

</style>
