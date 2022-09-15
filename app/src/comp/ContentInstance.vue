
<template lang='pug'>

div.content(ref='content_div' class='fetch-bible' @touchstart.passive='on_touch_start'
        @touchend.passive='on_touch_end' @touchmove.passive='on_touch_move'
        @touchcancel.passive='on_touch_cancel')

    div.prev_ch(ref='swipe_prev' :class='{disabled: state.chapter <= 1}')
        | {{ state.chapter - 1 }}
    div.next_ch(ref='swipe_next' :class='{disabled: state.chapter >= chapters.length}')
        | {{ state.chapter + 1 }}

    div.single(v-if='state.content' v-html='state.content')
    template(v-else)
        template(v-for='item of state.content_verses' :key='item.id')
            div.heading(v-if='"heading" in item' v-html='item.heading')
            div.verse(v-else)
                div.vid {{ item.verse }}
                //- eslint-disable-next-line vue/require-v-for-key
                div.verse_trans(v-for='html of item.html' v-html='html')

</template>


<script lang='ts' setup>

import {ref, onMounted, watch} from 'vue'

import {state, change_chapter} from '@/services/state'
import {chapters} from '@/services/computes'


// Swipe distance tracking
let touch_start_x:number|null = null
let touch_start_y:number|null = null
let touch_end_x:number|null = null
let touch_end_y:number|null = null

// Verse nodes
const verse_nodes = {} as Record<string, HTMLElement>
const chapter_nodes = {} as Record<string, HTMLElement>

// References to DOM elements
const swipe_prev = ref<HTMLDivElement>()
const swipe_next = ref<HTMLDivElement>()
const content_div = ref<HTMLDivElement>()


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


const scroll_to_verse = ([chapter, verse]:[number, number]) => {
    // Scroll to the given verse

    // Fallback on first of chapter if verse missing
    // NOTE Also better to use chapter node if first verse, so can show any headings too
    let node = verse_nodes[`${chapter}:${verse}`] ?? verse_nodes[`${chapter}:${verse-1}`]
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

    // Reset target once DOM gets a chance to finish scrolling
    // NOTE This is needed to block `chapter/verse` updating while scrolling past other verses
    setTimeout(() => {
        state.target = null
    }, 300)
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
        change_chapter(state.chapter + 1)
    } else if (distance < -50 && state.chapter > 1){
        change_chapter(state.chapter - 1)
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


onMounted(() => {
    // Discover verse elements once mounted so can scroll/detect them
    for (const node of content_div.value!.querySelectorAll('sup[data-v]')){
        verse_nodes[(node as HTMLElement).dataset['v']!] = node as HTMLElement
    }
    for (const node of content_div.value!.querySelectorAll('h3[data-c]')){
        chapter_nodes[(node as HTMLElement).dataset['c']!] = node as HTMLElement
    }

    // Scroll to current chapter
    scroll_to_verse(state.target ?? [state.chapter, state.verse])

    // Update chapter/verse in state when scroll past them
    const observer = new IntersectionObserver((entries) => {
        // Prevent state change while moving to a verse to prevent user confusion
        if (!state.target){
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
        }
    }, {
        root: content_div.value!,
        // Thin trigger line at around 1/3 from top of content area
        rootMargin: '-29% 0% -70% 0%',
    })
    for (const verse of Object.values(verse_nodes)){
        observer.observe(verse)
    }
})


watch(() => state.target, target => {
    // Scroll to verse whenever target changes
    if (target !== null){
        scroll_to_verse(target)
    }
})


</script>


<style lang='sass' scoped>

.content > *:last-child
    margin-bottom: 90vh  // So can scroll last verse to very top and trigger state for it

.single
    padding: 24px

.prev_ch, .next_ch
    position: absolute
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

    .vid
        display: flex
        width: 24px
        font-size: 0.8em
        justify-content: flex-end
        align-items: center
        opacity: 0.6

        @media (max-width: 600px)
            float: left
            margin-right: 6px


    .verse_trans
        flex-basis: 0
        flex-grow: 1
        padding: 6px 12px

        // No top/bottom margin for verse as have padding already
        :deep(> p:first-child)
            margin-top: 0
        :deep(> p:last-child)
            margin-bottom: 0

    // Color translations to distinguish between them
    .verse_trans:nth-child(2)
        background-color: transparent
    .verse_trans:nth-child(3)
        background-color: hsla(0, 50%, 50%, 0.15)
    .verse_trans:nth-child(4)
        background-color: hsla(40, 50%, 50%, 0.15)

    // Display translations in separate columns when screen wide enough
    @media (min-width: 600px)
        display: flex


</style>
