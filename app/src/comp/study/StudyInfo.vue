
<template lang='pug'>

h4.ref(@click='return_to_verse') {{ study_verse_label }}
v-btn.close(icon variant='flat' color='' @click='state.study = null')
    app-icon(name='close')

template(v-if='crossrefs.length')
    h5(class='mt-2') Related passages
    div.crossrefs
        StudyCrossref(v-for='crossref of crossrefs' :key='crossref.to_serialized()'
            :reference='crossref')
template(v-if='glosses.length')
    h5
        | Original language
        v-btn(color='' size='small' variant='flat'
                @click='state.original_chars = !state.original_chars')
            span.setting {{ state.original_chars ? 'original' : 'critical' }}
        v-btn(v-if='state.study?.ot' color='' size='small' variant='flat'
                @click='state.hebrew_ltr = !state.hebrew_ltr')
            span.setting {{ state.hebrew_ltr ? '⟼' : '⟻' }}
    div.orig(:class='{flex_ltr: state.hebrew_ltr}')
        StudyWord(v-for='(word, i) of glosses' :key='i' :word='word' :strongs='strongs[i]')
div(v-if='variants_url')
    v-btn(:href='variants_url' target='variants' color='' size='small' variant='tonal' rounded)
        | Variants &amp; Manuscripts
        app-icon(name='arrow_outward' small class='ml-1')
template(v-if='notes.length && state.study_notes && has_english_translation')
    h5 Tyndale Open Study Notes
    div.notes(ref='notes_div' class='text-body-2 fetch-bible')
        template(v-for='(note, i) of notes' :key='i')
            h4(v-if='note.reference.range') {{ note.reference.toString(state.book_names) }}
            div(v-html='note.contents')

</template>


<script lang='ts' setup>

import {computed, watch, ref, nextTick} from 'vue'
import {books_ordered, PassageReference} from '@gracious.tech/fetch-client'

import StudyWord from './StudyWord.vue'
import StudyCrossref from './StudyCrossref.vue'
import {change_to_ref, state, add_to_read_history} from '@/services/state'
import {content} from '@/services/content'

import type {GlossesWord, RelevantNotes} from '@gracious.tech/fetch-client'


const study_verse_label = computed(() => {
    if (!state.study){
        return ''
    }
    return state.study.toString(state.book_names)
})


const has_english_translation = computed(() => {
    // Only show English study notes if user is reading at least one English translation
    return state.trans.some(t => t.startsWith('eng_'))
})


// WARN Using watch instead of compute so that only updated when `study` changes
// Otherwise `state.crossref` will refer to the wrong book since study is disconnected from main
const crossrefs = ref<PassageReference[]>([])
watch(() => state.study, () => {
    if (!state.study || !state.crossref){
        crossrefs.value = []
        return
    }
    // NOTE Don't show more than 8 to not overwhelm users
    crossrefs.value = state.crossref.get_refs(state.study).slice(0, 8)
}, {immediate: true})


// WARN Using watch instead of compute so that only updated when `study` changes
// Otherwise `state.glosses` will refer to the wrong book since study is disconnected from main
const glosses = ref<GlossesWord[]>([])
watch(() => state.study, () => {
    if (!state.study || !state.glosses){
        glosses.value = []
        return
    }
    glosses.value = state.glosses.get_words(state.study)
}, {immediate: true})


// Just using watch since content.search_orig_ is async, not because it changes like others do
const strongs = ref<string[]>([])
watch(() => state.study, async () => {
    if (!state.study){
        strongs.value = []
        return
    }
    const testament = await (state.study.ot ? content.search_orig_ot : content.search_orig_nt)
    strongs.value = testament.get_words_for_ref(state.study)
}, {immediate: true})


// WARN Using watch instead of compute so that only updated when `study` changes
const notes = ref<RelevantNotes[]>([])
const notes_div = ref<HTMLDivElement>()
watch(() => state.study, () => {
    if (!state.notes || !state.study){
        notes.value = []
        return
    }

    // Get relevant notes and limit ranges to max 100 verses
    // As e.g. Chapters 1-5 is not a helpful note when clicking on individual verse
    notes.value = state.notes.get_relevant_notes(state.study.start_chapter, state.study.start_verse)
        .filter(note => note.reference.total_verses() < 100)

    // Make all passage references in notes clickable
    void nextTick(() => {
        for (const ref_span of notes_div.value?.querySelectorAll('span[data-ref]') ?? []){
            ref_span.addEventListener('click', event => {
                const parts = (event.target as HTMLDivElement).dataset['ref']?.split(',') ?? []
                const book = parts[0]
                if (book){
                    const [start_chapter, start_verse, end_chapter, end_verse] = parts.slice(1)
                        .map(part => parseInt(part))
                    const note_ref = new PassageReference(
                        {book, start_chapter, start_verse, end_chapter, end_verse})
                    add_to_read_history(state.study!)  // First save study verse leaving from
                    add_to_read_history(note_ref)
                    change_to_ref(note_ref)
                }
            })
        }
    })

}, {immediate: true})


// Link to variants
const variants_url = ref('')
watch(() => state.study, () => {
    if (!state.study){
        variants_url.value = ''
        return
    }

    // Determine CNTR code for verse
    const book_index = books_ordered.findIndex(b => b === state.study!.book)
    if (book_index < books_ordered.findIndex(b => b === 'mat')){
        variants_url.value = ''
        return  // No link for OT
    }
    const padded_book = String(book_index + 1).padStart(2, '0')  // CNTR indexes from 1
    const padded_ch = String(state.study.start_chapter).padStart(3, '0')
    const padded_v = String(state.study.start_verse).padStart(3, '0')
    const cntr_code = padded_book + padded_ch + padded_v

    // Set URL
    variants_url.value = `https://greekcntr.org/collation/index.htm?v=${cntr_code}`

}, {immediate: true})


const return_to_verse = () => {
    change_to_ref(state.study!)
    add_to_read_history(state.study!)
}


</script>


<style lang='sass' scoped>

.close, .ref
    position: absolute
    z-index: 1
    right: 0

.close
    margin-top: -14px  // Height of resize bar (less border)

.ref
    padding-right: 52px  // Width of .close button (48px) + some padding
    padding-left: 8px
    // So text doesn't scroll right under button
    background-color: rgb(var(--v-theme-surface))
    border-radius: 0 0 0 12px

h3
    display: flex
    justify-content: space-between

h5
    margin-top: 18px
    margin-bottom: 6px

.ref
    cursor: pointer
    color: rgb(var(--v-theme-primary))

.crossrefs
    display: flex
    flex-wrap: wrap
    gap: 8px

.orig
    display: flex
    flex-wrap: wrap
    gap: 8px

    &:not(.flex_ltr)
        flex-direction: row-reverse

.notes
    h4
        margin-top: 6px !important
        margin-bottom: 2px !important

    :deep() span[data-ref]
        color: rgb(var(--v-theme-primary))
        cursor: pointer

.orig
    margin-bottom: 8px
    font-size: 16px !important

.setting
    opacity: 0.5

</style>
