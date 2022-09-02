
<template lang='pug'>

div.content(ref='content_div' @touchstart.passive='on_touch_start' @touchend.passive='on_touch_end'
        @touchmove.passive='on_touch_move' @touchcancel.passive='on_touch_cancel')

    div.prev_ch(v-show='state.chapter > 1' ref='swipe_prev') {{ state.chapter - 1 }}
    div.next_ch(v-show='state.chapter < chapters.length' ref='swipe_next') {{ state.chapter + 1 }}

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

import {ref, onMounted} from 'vue'

import {state} from '@/services/state'
import {chapters} from '@/services/computes'


// Swipe distance tracking
let touch_start_x:number|null = null
let touch_start_y:number|null = null
let touch_end_x:number|null = null
let touch_end_y:number|null = null

// References to DOM elements
const swipe_prev = ref<HTMLDivElement>()
const swipe_next = ref<HTMLDivElement>()
const content_div = ref<HTMLDivElement>()
const chapter_nodes = ref([] as Element[])


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


const scroll_to_ch = (ch:number) => {
    // Scroll to the given chapter
    chapter_nodes.value[ch-1]!.scrollIntoView()
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
        scroll_to_ch(state.chapter + 1)
    } else if (distance < -50 && state.chapter > 1){
        scroll_to_ch(state.chapter - 1)
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
    // Discover chapter elements once mounted so can scroll to them
    chapter_nodes.value = [...content_div.value!.querySelectorAll('h3[data-c]')]

    // Update chapter in state when scroll past them
    const observer = new IntersectionObserver((entries) => {
        state.chapter = parseInt((entries[0]!.target as HTMLElement).dataset['c']!)
    })
    for (const chapter of chapter_nodes.value){
        observer.observe(chapter)
    }
})


</script>


<style lang='sass' scoped>

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
        background-color: hsla(0, 50%, 50%, 0.2)
    .verse_trans:nth-child(4)
        background-color: hsla(180, 50%, 50%, 0.2)

    // Display translations in separate columns when screen wide enough
    @media (min-width: 600px)
        display: flex


</style>
