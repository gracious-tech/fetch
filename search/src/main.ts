
import {Document} from 'flexsearch'
import EnglishPreset from 'flexsearch/lang/en'
import {PassageReference} from '@gracious.tech/bible-references'

import {strip_objects_from_txt, strip_tags_and_commentary} from './strip'

import type {BibleBookHtml, BibleBookTxt, FetchCollection} from '@gracious.tech/fetch-client'


export interface SearchResult {
    ref:PassageReference
    contents:string
}


export class BibleIndex {

    _flexsearch:Document
    _collection:FetchCollection
    _bible:string
    _format:'txt'|'html'
    _available_books:string[]

    constructor(collection:FetchCollection, bible:string, format:'txt'|'html'='html'){
        this._collection = collection
        this._bible = bible
        this._format = format
        this._available_books =
            this._collection.bibles.get_books(bible).map(book_meta => book_meta.id)

        // Init Document-type index that supports highlighting matches and other useful features
        this._flexsearch = new Document({
            encoder: EnglishPreset,  // TODO More language support
            tokenize: 'forward',  // Necessary to show results as you type
            document: {
                store: true,  // Store text in index so can display highlighted matches
                index: 'text',  // The prop to be indexed (must match what is provided)
            },
        })

    }

    // Prepare items for book to add to index
    // NOTE Uses the books' public verse lists (internal fields differ between formats)
    _get_items_for_book(book_id:string, book:BibleBookHtml|BibleBookTxt){
        const verses = this._format === 'html'
            ? (book as BibleBookHtml).get_list().map(verse => ({...verse,
                text: strip_tags_and_commentary(verse.content)}))
            : (book as BibleBookTxt).get_list().map(verse => ({...verse,
                text: strip_objects_from_txt(verse.content)}))
        return verses.map(verse => ({
            id: `${book_id}${verse.chapter}:${verse.verse}`,  // Serialized PassageReference
            text: verse.text,
        }))
    }


    // Index given books
    async index_books(books:string[]):Promise<void>{

        // Do all network requests simultaneously, but must add items to index synchronously
        // NOTE Use a single shared chain so concurrent book handlers don't drop each other
        let chain:Promise<unknown> = Promise.resolve()
        const requests = books.map(async book_id => {

            // Get book
            // NOTE This assumes that caching is enabled on collection for better performance
            // NOTE Forcing format to 'txt' to keep TS happy, even though both valid
            const book = await this._collection.bibles.fetch_book(
                this._bible, book_id, this._format as 'txt')

            // Append all items for this book to the shared chain, capturing the new tail
            const items = this._get_items_for_book(book_id, book)
            const book_tail = items.reduce((prev, item) => {
                return prev.then(() => this._flexsearch.addAsync(item))
            }, chain)
            chain = book_tail
            await book_tail
        })

        // Wait for all requests (and their indexing work) to complete
        await Promise.all(requests)
    }

    // Convenience method for indexing all books
    async index_all_books():Promise<void>{

        // Measure time taken
        const time = new Date().getTime()

        // Index all books in bible
        await this.index_books(this._available_books)

        // @ts-ignore Don't know why it's complaining
        console.info(`Search indexing duration: ${new Date().getTime() - time}ms`)
    }

    // Search the index
    async search(query:string, group=true, marker?:string):Promise<SearchResult[]>{

        // Detect any explicit references to passages
        const passage_results:SearchResult[] = []
        for (const match of this._collection.bibles.detect_references(query, this._bible)){

            // Can't use if bible doesn't have book
            if (!this._available_books.includes(match.ref.book)){
                continue
            }

            // Need to get the passage (which is hopefully cached already)
            // NOTE Format may be txt|html but force type to keep TS happy
            // NOTE While inefficient to parse whole book for single passage,
            //      in most cases this will be a single match only and not several search results
            const book = await this._collection.bibles.fetch_book(this._bible, match.ref.book,
                this._format as 'txt')

            // Get passage contents
            let plain_text:string
            if (this._format === 'txt'){
                plain_text = book.get_passage_from_ref(match.ref, {
                    attribute: false,
                    headings: false,
                    notes: false,
                    verse_nums: false,
                })
            } else {
                const passage_html = (book as unknown as BibleBookHtml)
                    .get_passage_from_ref(match.ref, {attribute: false})
                plain_text = strip_tags_and_commentary(passage_html)
            }

            // Add
            passage_results.push({
                ref: match.ref,
                contents: plain_text,
            })

            // Remove from query so doesn't mess with keyword search results if any
            query = query.replace(match.text, '')
        }

        // Determine template for highlighting results
        if (!marker){
            marker = this._format === 'html' ? 'mark' : '_'
        }
        const highlight_template =
            this._format === 'html' ? `<${marker}>$1</${marker}>` : `${marker}$1${marker}`

        // Search index
        const flex_results = await this._flexsearch.searchAsync(query, {
            enrich: true,  // Return verse contents with results
            highlight: highlight_template,
        })

        // When no results, flexsearch doesn't even include result array, so add to avoid bugs
        if (!flex_results.length){
            flex_results.push({result: []})
        }

        // Deserialize results
        let search_results:SearchResult[] = flex_results[0]!.result.map(result => {
            return {
                ref: PassageReference.from_serialized(result.id as string),
                contents: result.highlight!,
            }
        })

        // Optionally group adjacent verses together as one result
        if (group){

            // Group results by book so can then sort by verse properly
            const grouped_by_book:Record<string, SearchResult[]> = {}
            for (const result of search_results){  // Only one field indexed, hence [0]
                grouped_by_book[result.ref.book] ??= []
                grouped_by_book[result.ref.book]!.push(result)
            }

            // Sort and join verses for each book
            for (const book in grouped_by_book){

                // Sort by verse (each result is a single verse at this point)
                grouped_by_book[book]!.sort((a, b) => a.ref.start_chapter - b.ref.start_chapter
                    || a.ref.start_verse - b.ref.start_verse)

                // Join consecutive verses
                const consecutive:SearchResult[] = [grouped_by_book[book]!.shift()!]  // Add 1st
                for (const result of grouped_by_book[book]!){
                    const verse_after_prev_item = consecutive.at(-1)!.ref.get_next_verse(true)
                    if (verse_after_prev_item && result.ref.equals(verse_after_prev_item)){
                        const popped = consecutive.pop()!
                        consecutive.push({
                            ref: PassageReference.from_refs(popped.ref, result.ref),
                            contents: popped.contents + ' ' + result.contents,
                        })
                    } else {
                        consecutive.push(result)
                    }
                }
                grouped_by_book[book] = consecutive
            }

            // No longer need to group by book
            search_results = Object.values(grouped_by_book).flat()
        }

        // Sort all by frequency of matched tokens
        const detect_marker = this._format === 'html' ? `<${marker}>` : marker
        search_results.sort((a, b) => {
            // Crude but effective method to just search for markers (whether start/end/both)
            return b.contents.split(detect_marker).length - a.contents.split(detect_marker).length
        })

        // Return all results with passage results first
        return [...passage_results, ...search_results]
    }
}
