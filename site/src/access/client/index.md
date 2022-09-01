
<script setup>
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
</script>


# Client (API)

`npm install @gracious.tech/fetch-client`

A fetch(bible) collection is just a CDN, so you can't make requests for specific passages, which is where this client comes in.

This client helps to:
 * Explore a collection's contents
 * Extract specific passages from CDN resources
 * Correctly style Bible text with CSS

You can also use this client to access your own self-hosted collection if you choose not to use the official one.

## Supported environments

You can use this client both client-side and server-side.

__Browsers:__ ES2015/ES6+
<br>
__Node:__ 18+


## Usage

The standard way to use the client is to start with a `new BibleClient()` and then call `fetch_collection()`, which will return a promise for a `BibleCollection` which you can use to explore all the languages and translations available, and then call `fetch_html(translation, book)` and similar methods to get access to actual Bible content.

Methods starting with `fetch_` will make a network request and return a promise, where as methods starting with `get_` do not and are synchronous. For methods that return a list (e.g. languages, translations) you can usually pass `{object: true}` in the options argument to have them return an object keyed by `id` instead.

If your code editor supports Typescript you'll get helpful auto-suggestions that explain all the methods and arguments possible, or alternatively you can also explore the [auto-generated docs](api/classes/client.BibleClient.html).


## Example

Here is a basic example that outputs a single chapter of a random translation and book.

```typescript

import {BibleClient} from '@gracious.tech/fetch-client'

// Init client
const client = new BibleClient()

// Fetch the collection's meta data
const collection = await client.fetch_collection()

// Get what translations are available
const translations = collection.get_translations()

// Get the id of the first translation available
const translation_id = translations[0].id

// Get what books are available for the translation
// (may be whole Bible or may only be e.g. NT)
const books = collection.get_books(translation_id)

// Fetch the contents of the first book as HTML
const book = await collection.fetch_html(translation_id, books[0].id)

// Output the HTML of the first chapter of the book
console.log(book.get_chapter(1))

```

<p><VPButton href='/access/client/example/' text="See more detailed example" theme='alt'></VPButton></p>


## Design
This client has zero dependencies, no differences between the browser and Node versions (no unused code), and is overall very small and fast. It only connects to the endpoints you specify so can be used completely independently of the official fetch(bible) service.
