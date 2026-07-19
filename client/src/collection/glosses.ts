
import {GenericCollection} from './generic.js'
import {GlossesBook} from '../book/glosses.js'


export class GlossesCollection extends GenericCollection {

    // Get the URL for a book's glosses (useful for caching and manual retrieval)
    get_book_url(resource:string, book:string){
        this._ensure_book_exists(resource, book)
        const real_id = this._resolve_book_resource(resource, book)
        const endpoint = this._items[real_id]!.endpoint
        return `${endpoint}glosses/${real_id}/json/${book}.json`
    }

    // Fetch glosses for book
    async fetch_glosses(resource:string, book:string):Promise<GlossesBook>{
        const url = this.get_book_url(resource, book)
        const json = await this.requester.request(url)
        return new GlossesBook(json)
    }
}
