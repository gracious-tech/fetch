
import {GenericCollection} from './generic.js'
import {NotesBook} from '../book/notes.js'


export class NotesCollection extends GenericCollection {

    // Get the URL for a book's notes (useful for caching and manual retrieval)
    get_book_url(resource:string, book:string, format:'html'|'txt'|'typst'='html'){
        this._ensure_book_exists(resource, book)
        const real_id = this._resolve_book_resource(resource, book)
        const endpoint = this._items[real_id]!.endpoint
        return `${endpoint}notes/${real_id}/${format}/${book}.json`
    }

    // Fetch study notes for book
    async fetch_notes(resource:string, book:string, format:'html'|'txt'|'typst'='html'):
            Promise<NotesBook>{
        const url = this.get_book_url(resource, book, format)
        const json = await this.requester.request(url)
        return new NotesBook(json)
    }
}
