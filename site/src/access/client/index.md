
# Client (API)

`npm install @gracious.tech/fetch-client`

A fetch(bible) collection is just a CDN, so you can't make requests for specific passages, which is where this client comes in.

This client helps to:
 * Explore a collection's contents
 * Extract specific passages from CDN resources
 * Correctly style Bible text with CSS

You can also use this client to access your own self-hosted collection if you choose not to use the official one.


## Usage

The standard way to use the client is to start with a `new FetchClient()` and then call `fetch_collection()`, which will return a promise for a `FetchCollection` which you can use to explore all the languages and translations available, and then call `fetch_book(translation, book)` and similar methods to get access to actual Bible content.

Methods starting with `fetch_` will make a network request and return a promise, where as methods starting with `get_` do not and are synchronous. For methods that return a list (e.g. languages, translations) you can usually pass `{object: true}` in the options argument to have them return an object keyed by `id` instead.


### Example

```typescript

import {FetchClient} from '@gracious.tech/fetch-client'

// Init client
const client = new FetchClient()

// Fetch the collection's meta data
const collection = await client.fetch_collection()

// Get what translations are available
const translations = collection.bibles.get_resources()

// Get the id of the first translation available
const translation_id = translations[0].id

// Load local book names for the translation
await collection.bibles.fetch_translation_extras(translation_id)

// Get what books are available for the translation
// (may be whole Bible or may only be e.g. NT)
const books = collection.bibles.get_books(translation_id)

// Fetch the contents of the first book
const book = await collection.bibles.fetch_book(translation_id, books[0].id)

// Output the HTML of the first chapter of the book
console.log(book.get_chapter(1))

```

<p><VPButton href='/access/client/example/' text="See more detailed example"></VPButton></p>


## Documentation

If your code editor supports Typescript you'll get helpful auto-suggestions that explain all the methods and arguments possible, or alternatively you can also explore the auto-generated docs. The most important classes being:

 * `new FetchClient()` -> [FetchClient](/access/client/api/client/classes/FetchClient)
    * `.fetch_collection()` -> [FetchCollection](/access/client/api/collection/collection/classes/FetchCollection)
        * `.bibles.fetch_book(...)` -> [BibleBookHtml](/access/client/api/book/bible/classes/BibleBookHtml)

[All modules](/access/client/api/)

The client also re-exports [PassageReference](https://github.com/gracious-tech/fetch/tree/master/references) which is useful for converting between string and object passage references (e.g. "Gen 1:1").


## Supported environments

You can use this client both client-side and server-side.

### Browsers (ES2019+)

It is recommended to use a bundler (like Vite or Webpack) and simply `import {FetchClient} from '@gracious.tech/fetch-client'`. This will use the published ESM form which supports tree-shaking.

If you can't use a bundler for some reason, you can also:

 * Deploy `dist/bundled.mjs` and import it in a `<script type='module'>`
 * Deploy `dist/bundled.iife.js` and include it via a regular `<script src='...'>`
    * It will create a `fetch_client` global variable, so you can access `fetch_client.FetchClient`

### Node (18+)

It is recommended to use ESM import/export syntax by setting `"type": "module"` in your `package.json`. You can then:

`import {FetchClient} from '@gracious.tech/fetch-client'`

If you need to still use the old `require()` syntax for other modules, you can still use the ESM form via a dynamic import:

`import('@gracious.tech/fetch-client').then(({FetchClient}) => ...)`

or you can require the bundled CJS form with:

`const {FetchClient} = require('@gracious.tech/fetch-client')`


## Styles
The client includes a functional stylesheet, meaning styles that are minimalistic and critical for correct display. If you don't include this in your project then, for example, footnotes etc. are going to appear inline and undistinguishable from actual scripture.

If you use a tool like Webpack or Vite then you'll simply need to `import '@gracious.tech/fetch-client/client.css'` in a Javascript module, or you could alternatively deploy it with your code and use a `<link>` element to include it.

All styles are namespaced under the class `fetch-bible` and all subclasses are prefixed with `fb-` so that it won't affect your existing styles and they also are unlikely to affect fetch(bible) HTML. So you must embed fetch(bible) HTML under a container element with the class `fetch-bible`.

The following classes can be added to your `.fetch-bible` container element:

Class               | Effect
| -                 | -
`.fb-plain`         | Disables the more opinionated aspects of the styles so you can more easily customise them to suit your situation. E.g. Disables fading of verse numbers, chapter heading styling, notes show-on-hover, etc
`.no-verses`     | Hides verse numbers
`.no-chapters`   | Hides chapter headings
`.no-headings`   | Hides section headings
`.no-notes`      | Hides translation notes
`.no-red-letter` | Disables coloring words of Jesus in red (for translations that support it)
`.no-select`     | Disables ability to select verse numbers/headings/etc when copy/pasting
`.no-initial-indent` | Reduces all indented text by 1 level (useful when entire book is poetry)

The `.fetch-bible` class also has some variables you can customise:

Variable                        | Default           | Description
| -                             | -                 | -
`--fb-red-letter`               | `hsl(0, 60%, 50%)`| The color of Jesus' words (for translations that support it). Be sure to choose a color that works for both light & dark backgrounds.
`--fb-alt-italic-filter`        | `opacity(0.85)`   | A CSS filter to apply to text that would normally be displayed in italics, for use when italics aren't suitable for a language's script.
`--fb-alt-bold-filter`          | `contrast(2)`     | A CSS filter to apply to text that would normally be displayed in bold, for use when bold isn't suitable for a language's script.
`--fb-alt-bold-italic-filter`   | `drop-shadow(0 0 5px hsl(0, 50%, 0%))` | A CSS filter to apply to text that would normally be displayed in bold+italics, for use when bold+italics isn't suitable for a language's script.


## Dual OT/NT ids

You can choose to use a separate text for the OT and NT by specifying an id of the form `ot_id|nt_id`. This is especially useful for original languages (Hebrew/Greek) which are only ever one testament.

You can treat this dual id just like any other resource id — `fetch_book()`, `fetch_translation_extras()`, `get_books()`, etc. all accept it and transparently fetch from whichever half owns each book. Dual ids aren't returned by `get_resources()` since they aren't real entries in the collection's manifest; you construct them yourself by joining the two individual translation ids with `|`.


## Design
This client has zero external dependencies, no differences between the browser and Node versions (no unused code), and is overall very small and fast. It only connects to the endpoints you specify so can be used completely independently of the official fetch(bible) service.


## Breaking Changes

### Version 1.0.0

 * Official collection upgraded and now found at [v1.fetch.bible](https://v1.fetch.bible) (client defaults to the new collection)
 * Some bibles removed or changed id (always verify a translation still exists before using)
 * `get_languages()` item props renamed to `name_local`, `name_english`, `population`
 * Must now call `fetch_translation_extras()` to get book names in translation's language
 * `get_preferred_language()` and `get_preferred_translation()` now return objects

### Version 2.0.0

 * `BibleClient` renamed to `FetchClient`
 * `BibleCollection` renamed to `FetchCollection`
 * Methods of old `BibleCollection` now accessible at `FetchCollection.bibles`
 * The word "resource" is now used in place of "translation" for all methods and arguments
