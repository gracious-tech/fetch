
<template lang='pug'>

div.column
    div.word(@click='search_original' :class='{ot: state.study?.ot}')
        | {{ displayed }}
    a.gloss(:href='research_url' target='research') {{ gloss }}

</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {state} from '@/services/state'

import type {GlossesWord} from '@gracious.tech/fetch-client'
import type {OrigSearchWord} from '@/services/types'


const props = defineProps<{word:GlossesWord, strongs:string|undefined}>()


const displayed = computed(() => {
    return state.original_chars ? props.word.original : props.word.word
})


const gloss = computed(() => {
    // If blank or hyphen, replace with mdash so easier to click
    if (!props.word.gloss || props.word.gloss === '-'){
        return '—'  // mdash
    }
    return props.word.gloss
})

const research_url = computed(() => {

    // Strong code may not be available for word
    if (!props.strongs){
        const q = encodeURIComponent(props.word.word)
        if (state.study?.ot){
            return 'https://biblehub.com/searchhebrew.php?q=' + q
        }
        return 'https://biblehub.com/searchgreek.php?q=' + q
    }
    const lang_path = state.study?.ot ? 'hebrew' : 'greek'
    // NOTE Sometimes has letter at end (e.g. 1254a)
    //   Bible Hub seems to support these but with less info, so removing
    const strong_num = parseInt(props.strongs.slice(1).replace(/\D/, ''))
    return `https://biblehub.com/${lang_path}/${strong_num}.htm`
})


const search_original = () => {

    // Can't search if no strongs code and in strongs mode
    const mode = state.search_orig_mode
    if (mode === 'strongs' && !props.strongs){
        return
    }

    // Open nav on narrow screens
    state.show_nav = true

    // Prepare to add word to search
    const to_add:OrigSearchWord = {
        word: props.word.word,
        original: props.word.original,
        strongs: props.strongs ?? '',  // ?? '' to keep TS happy, checked already above
    }

    // Reset if none or different testament
    if (!state.search_orig || state.search_orig.ot !== state.study!.ot){
        state.search_orig = {ot: state.study!.ot, words: [to_add]}
        return
    }

    // Adding word to existing words being searched for
    // But don't add if already there
    // NOTE Comparing strongs===strongs or original===original
    if (state.search_orig.words.find(w => w[mode] === to_add[mode])){
        return
    }

    // Add to the list!
    state.search_orig.words.push(to_add)
}

</script>


<style lang='sass' scoped>

.column
    display: flex
    flex-direction: column
    align-items: center
    text-align: center

.word
    margin-bottom: 4px
    &.ot
        direction: rtl

.gloss
    max-width: 100px
    font-size: 14px

.word, .gloss
    cursor: pointer

    &:hover
        color: rgb(var(--v-theme-primary-lighten-1))

</style>
