
# fetch(bible) client

`npm install @gracious.tech/fetch-client` (browser and Node)

This client is designed to interact with [fetch(bible)](https://fetch.bible).

A fetch(bible) collection is just a CDN, so you can't make requests for specific passages, which is where this client comes in.

This client helps to:
 * Explore a collection's contents
 * Extract specific passages from CDN resources
 * Correctly style Bible text with CSS

You can also use this client to access your own self-hosted collection if you choose not to use the official one.

### Supported environments

__Browsers:__ ES2015/ES6+

__Node:__ 18+


### Example

Here is a basic example that displays a single chapter of a random translation and book.

```typescript

import {BibleClient} from '@gracious.tech/fetch-client'

// Init client for default collection
const client = new BibleClient()

// Fetch the collection's meta data
const collection = await client.fetch_collection()

// Get what translations are available
const translations = collection.get_translations()

// Get the id of the first translation available
const first_translation = translations[0].id

// Get what books are available for the translation
const books = collection.get_books(first_translation)

// Fetch the contents of the first book as HTML
const book = await collection.fetch_html(first_translation, books[0].id)

// Display the first chapter of the book
console.log(book.get_chapter(1))

```

## Design
This client has zero dependencies, no differences between the browser and Node versions (no unused code), and is overall very small and fast. It only connects to the endpoints you specify so can be used completely independently of the official fetch(bible) service.


## More info

[DOCUMENTATION](https://fetch.bible/access/client/classes/client.BibleClient.html)

[DETAILED EXAMPLE](https://fetch.bible/access/client-example/)
