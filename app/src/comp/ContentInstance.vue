
<template lang='pug'>

div.content(ref='content_div' :class='fetch_classes' @click='on_click'
        @touchstart.passive='on_touch_start' @touchend.passive='on_touch_end'
        @touchmove.passive='on_touch_move' @touchcancel.passive='on_touch_cancel')

    div.prev_ch(ref='swipe_prev' :class='{disabled: state.chapter <= 1}')
        | {{ state.chapter - 1 }}
    div.next_ch(ref='swipe_next' :class='{disabled: state.chapter >= chapters.length}')
        | {{ state.chapter + 1 }}

    div.single(v-if='state.content' v-html='state.content')
    template(v-else)
        div.verse(v-for='(item, verse_i) of state.content_verses[0]' :key='item.id')
            div.verse_trans(v-for='(trans, trans_i) of state.trans' :key='trans'
                :class='direction[trans_i]'
                v-html='state.content_verses[trans_i]?.[verse_i]?.content')

</template>


<script lang='ts' setup>

import {ref, onMounted, watch, computed} from 'vue'

import {PassageReference} from '@gracious.tech/bible-references'
import {substantial_poetry, wrap_verse_parts, add_passage_class, rm_passage_class}
    from '@gracious.tech/fetch-client'

import {state, change_passage} from '@/services/state'
import {chapters, direction} from '@/services/computes'


// Swipe distance tracking
let touch_start_x:number|null = null
let touch_start_y:number|null = null
let touch_end_x:number|null = null
let touch_end_y:number|null = null

// References to DOM elements
const swipe_prev = ref<HTMLDivElement>()
const swipe_next = ref<HTMLDivElement>()
const content_div = ref<HTMLDivElement>()

// Manual DOM access
let verse_nodes:Record<string, HTMLElement>
let chapter_nodes:Record<string, HTMLElement>
let observer:IntersectionObserver


// Fetch classes
const fetch_classes = computed(() => {
    return {
        'fetch-bible': true,
        'no-headings': !state.show_headings,
        'no-chapters': !state.show_chapters,
        'no-verses': !state.show_verses,
        'no-notes': !state.show_notes,
        'no-red-letter': !state.show_redletter,
        'no-select': true,
        'no-initial-indent': substantial_poetry.includes(state.book),
        [`size-${state.font_size}`]: true,
    }
})


function intentional_swipe_distance(){
    // Calculate horizontal swipe distance and reduce it by vertical (i.e. intentionality)

    // If touch_end_x is set then all the others will be too
    if (touch_end_x === null){
        return 0
    }

    // Calc x distance (keeping sign for direction)
    let x_distance = touch_start_x! - touch_end_x

    // Calc y distance (ignoring direction)
    const y_distance = Math.abs(touch_start_y! - touch_end_y!)
    if (y_distance > 100){
        // Have moved too much vertically to be intentional swipe so ignore until next touch
        cancel_swipe()
    }

    // Reduce x distance by how ever long y distance is
    if (x_distance > 0){
        x_distance = Math.max(0, x_distance - y_distance)
    } else {
        x_distance = Math.min(0, x_distance + y_distance)
    }

    return x_distance
}


function cancel_swipe(){
    // Reset swipe props and don't respond to touch movement until next touch start

    // Reset distance values
    touch_start_x = null
    touch_start_y = null
    touch_end_x = null
    touch_end_y = null

    // Reset appearance of swipe icons
    swipe_prev.value!.style.left = `-48px`
    swipe_next.value!.style.right = `-48px`
    swipe_prev.value!.style.opacity = `0`
    swipe_next.value!.style.opacity = `0`

    // Enable animation for swipe icons as they return to their original position
    swipe_next.value!.style.transition = 'opacity 1s, left 1s, right 1s'
    swipe_prev.value!.style.transition = 'opacity 1s, left 1s, right 1s'
}


const scroll_to_verse = (chapter:number, verse:number) => {
    // Scroll to the given verse

    // Get node for verse marker
    let node = verse_nodes[`${chapter}:${verse}`]
    if (!node){
        // Fallback on previous verse
        const prev = new PassageReference(state.book, chapter, verse).get_prev_verse()
        if (prev){
            node = verse_nodes[`${prev.start_chapter}:${prev.start_verse}`]
        }
    }

    // Fallback on first of chapter if verse missing
    // NOTE Also better to use chapter node if first verse, so can show any headings too
    if (!node || verse === 1){
        node = chapter_nodes[chapter]
    }

    // Get position of content div for use in calcs
    // NOTE `getBoundingClientRect` results are relative to viewport (and not parent like scroll is)
    const content_top = content_div.value!.getBoundingClientRect().top

    // Get position of verse and scroll to it if find it
    const rect = node?.getBoundingClientRect()
    if (rect){
        // Scroll so verse is near top of screen but prev verse still visible
        // NOTE Adding content_top effectively offsets any toolbar (rect is relative to viewport)
        const buffer = content_top + 60
        const top = Math.max(0, content_div.value!.scrollTop + rect.top - buffer)
        content_div.value!.scroll({top})
    }
}


const on_click = (event:MouseEvent) => {

    // Only listen to clicks on verses
    if (! (event.target instanceof HTMLElement) || !event.target.dataset['v']){
        return
    }

    // Identify the verse
    const data_v = event.target.dataset['v']
    const data_v_ints = data_v.split(':').map(part => parseInt(part))
    const new_study = new PassageReference(state.book, data_v_ints[0], data_v_ints[1])

    // If clicking on verse already being studied, deselect it instead
    if (state.study && state.study.equals(new_study)){
        state.study = null
    } else {
        state.study = new_study
    }
}


const on_touch_start = (event:TouchEvent) => {
    // Init start vars when a new touch again begins
    if (event.touches.length === 1){
        touch_start_x = event.touches[0]!.pageX
        touch_start_y = event.touches[0]!.pageY
        // Disable animation so swipe feels more responsive
        swipe_prev.value!.style.transition = ''
        swipe_next.value!.style.transition = ''
    }
}


const on_touch_end = () => {
    // Once a touch action ends, determine if should change chapter
    const distance = intentional_swipe_distance()
    if (distance > 50 && state.chapter < chapters.value.length){
        change_passage(state.chapter + 1)
    } else if (distance < -50 && state.chapter > 1){
        change_passage(state.chapter - 1)
    }
    cancel_swipe()
}


const on_touch_move = (event:TouchEvent) => {
    // React to touch movement
    if (event.touches.length){

        // Update touch end point
        touch_end_x = event.touches[0]!.pageX
        touch_end_y = event.touches[0]!.pageY

        // Calc swipe distance
        const distance = intentional_swipe_distance()

        // Update position and opacity of swipe icons
        swipe_prev.value!.style.left = `${Math.min(60, distance * -1 - 48)}px`
        swipe_next.value!.style.right = `${Math.min(60, distance - 48)}px`
        swipe_prev.value!.style.opacity = `${(distance * -1 + 10) / 100}`
        swipe_next.value!.style.opacity = `${(distance + 10) / 100}`
    }
}


const on_touch_cancel = () => {
    // Cancel swipe when touch ends
    cancel_swipe()
}


// Manual interaction with DOM of verses
const update_dom = () => {

    // Wrap parts of verses in spans
    wrap_verse_parts(content_div.value!)

    // Discover verse elements once mounted so can scroll/detect them
    // NOTE Only adds if not yet defined (so skip ones in additional translations)
    verse_nodes = {}
    for (const node of content_div.value!.querySelectorAll('sup[data-v]')){
        verse_nodes[(node as HTMLElement).dataset['v']!] ??= node as HTMLElement
    }
    chapter_nodes = {}
    for (const node of content_div.value!.querySelectorAll('h3[data-c]')){
        chapter_nodes[(node as HTMLElement).dataset['c']!] ??= node as HTMLElement
    }

    // Scroll to current chapter
    scroll_to_verse(state.chapter, state.verse)

    // Highlight if a range specified
    if (state.study){
        highlight_study()
    }
    if (state.passage){  // Do second so that study doesn't wipe out a new passage highlight
        highlight_passage()
    }

    // Update chapter/verse in state when scroll past them
    observer = new IntersectionObserver((entries) => {
        for (const entry of entries){

            // Ignore when nodes leave capture area, only listen when they enter
            if (!entry.isIntersecting){
                continue
            }

            const [ch, v] = (entry.target as HTMLElement).dataset['v']!.split(':')
            state.chapter = parseInt(ch!)
            state.verse = parseInt(v!)
            break  // Only pay attention to one verse if multiple
        }
    }, {
        root: content_div.value!,
        // Thin trigger line at around 1/3 from top of content area
        rootMargin: '-29% 0% -70% 0%',
    })
    for (const verse of Object.values(verse_nodes)){
        observer.observe(verse)
    }
}


onMounted(() => {
    watch([() => state.content, () => state.content_verses], () => {
        if (state.content || state.content_verses.length){
            update_dom()
        }
    }, {immediate: true, flush: 'post'})  // Trigger after DOM updated
})


watch([() => state.content, () => state.content_verses], () => {
    // Disconnect previous observer before it overwrites newly set passage
    if (observer){
        observer.disconnect()
    }
}, {flush: 'sync'})  // Disconnect before Vue starts modifying any DOM


watch(() => state.passage, passage => {
    // Navigate and highlight passage when it changes
    if (passage){
        scroll_to_verse(passage.start_chapter, passage.start_verse)
    }
    highlight_passage()
}, {flush: 'post'})  // Don't try scroll until DOM ready


watch(() => state.study, study => {
    highlight_study()
})


// Highlight (or clear) the verse being studied whenever it changes
const highlight_study = () => {
    rm_passage_class(content_div.value!, 'hl-study')
    // Also clear passage when selecting/deselecting a verse (show study highlight instead)
    rm_passage_class(content_div.value!, 'hl-passage')

    // Only highlight if study verse is same book as currently displayed
    if (state.study && state.study.book === state.book){
        add_passage_class(content_div.value!, state.study, 'hl-study')
    }
}


// Highlight (or clear) the current passage in focus
const highlight_passage = () => {
    rm_passage_class(content_div.value!, 'hl-passage')
    // These types make sense to highlight (range_chapters would be too long and unnecessary)
    const types = ['verse', 'range_verses', 'range_multi']
    if (state.passage && state.passage.book === state.book && types.includes(state.passage.type)){
        add_passage_class(content_div.value!, state.passage, 'hl-passage')
    }
}


</script>


<style lang='sass' scoped>

.content > *:last-child
    margin-bottom: 85vh  // So can scroll last verse to very top and trigger state for it

.fetch-bible
    // Custom font size settings
    &.size-small
        font-size: 14px
        @media (min-width: 800px)
            font-size: 16px
    &.size-large
        font-size: 18px
        @media (min-width: 800px)
            font-size: 20px
    &.size-very-large
        font-size: 20px
        @media (min-width: 800px)
            font-size: 22px

    // Make chapter headings invisible rather than not present, so doesn't mess up navigation
    // WARN Changing this can break chapter navigation
    &.no-chapters :deep(h3[data-c])
        display: block !important
        visibility: hidden

    // Make verse numbers buttons
    :deep(sup[data-v])
        background-color: #8884
        display: inline-flex
        justify-content: center
        align-items: center
        vertical-align: middle
        position: static
        border-radius: 50%
        padding: 0 !important
        margin-right: 0.3em
        width: 2em
        height: 2em
        cursor: pointer

        &:hover
            background-color: rgb(var(--v-theme-primary))

    :deep(.fb-attribution)
        margin-top: 80px !important
        opacity: 0.5
        text-align: center
        a
            color: inherit
            text-decoration: none
            &:hover
                text-decoration: underline

.single
    padding: 24px

.prev_ch, .next_ch
    position: fixed
    top: 50%
    width: 48px
    height: 48px
    display: flex
    justify-content: center
    align-items: center
    background-color: rgb(var(--v-theme-primary))
    font-weight: bold
    opacity: 0

    &.disabled
        color: transparent  // Hide text
        background-color: hsla(0, 0%, 50%, 0.8)

.prev_ch
    left: -48px
    border-radius: 24px 6px 6px 24px

.next_ch
    right: -48px
    border-radius: 6px 24px 24px 6px

.heading
    padding: 12px

.verse
    // Parallel translations

    .verse_trans
        flex-basis: 0
        flex-grow: 1
        padding: 6px 12px

        &.rtl
            direction: rtl

        // Hide verse markers in additional translations
        &:not(:first-child) :deep(sup[data-v])
            display: none

        // No top/bottom margin for verse as have padding already
        :deep(> *:first-child)
            margin-top: 0
        :deep(> *:last-child)
            margin-bottom: 0

    // Color translations to distinguish between them
    .verse_trans:nth-child(1)
        background-color: transparent
    .verse_trans:nth-child(2)
        background-color: hsla(0, 50%, 50%, 0.15)
    .verse_trans:nth-child(3)
        background-color: hsla(40, 50%, 50%, 0.15)

    // Display translations in separate columns when screen wide enough
    @media (min-width: 600px)
        display: flex


.content :deep(.hl-passage)
    background-color: rgb(var(--v-theme-primary), 0.25)

.content :deep(.hl-study)
    background-color: rgb(var(--v-theme-primary), 0.5)

</style>
