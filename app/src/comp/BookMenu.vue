
<template lang='pug'>

v-list(density='compact' color='primary')

    //- Loop through OT books since has more than NT so indexes will still work
    template(v-for='(item, i) of ot_books' :key='item.id')

        div.row
            v-list-item(:active='book === item.id' :disabled='!item.available'
                    @click='select_book(item.id)')
                v-list-item-title {{ item.local || item.english }}
            v-list-item(v-if='i < nt_books.length' :active='book === nt_books[i].id'
                    :disabled='!nt_books[i].available' @click='select_book(nt_books[i].id)')
                v-list-item-title {{ nt_books[i].local || nt_books[i].english }}

        div.chapters(v-if='(book === item.id || book === nt_books[i]?.id) && chapters.length > 1'
                :class='{nt: book === nt_books[i]?.id}')
            v-btn(v-for='ch of chapters' :key='ch' :active='chapter === ch' icon variant='text'
                    :color='chapter === ch ? "primary" : ""' @click='select_ch(ch)')
                | {{ ch }}

</template>


<script lang='ts' setup>

import {computed} from 'vue'

import {state, change_chapter} from '@/services/state'
import {content} from '@/services/content'
import {chapters} from '@/services/computes'


// State shortcuts
const book = computed(() => state.book)
const chapter = computed(() => state.target?.[0] || state.chapter)


// Get lists of OT and NT books
const ot_books = computed(() => {
    return content.collection.get_books(state.trans[0], {testament: 'ot', whole: true})
})
const nt_books = computed(() => {
    return content.collection.get_books(state.trans[0], {testament: 'nt', whole: true})
})


// Change book
const select_book = (id:string) => {
    state.book = id
    change_chapter(1)
    if (chapters.value.length === 1){
        state.show_select_chapter = false
    }
}


// Change chapter
const select_ch = (num:number) => {
    change_chapter(num)
    state.show_select_chapter = false
}


</script>


<style lang='sass' scoped>

.row
    display: flex

    // Make OT/NT columns equal width
    > *
        flex-grow: 1
        flex-basis: 0

.chapters
    &.nt
        text-align: right

.v-list-item
    min-height: 30px  // TODO Vuetify density not working

</style>
