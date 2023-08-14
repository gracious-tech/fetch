
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

### Browsers (ES2019+)

It is recommended to use a bundler (like Vite or Webpack) and simply `import {BibleClient} from '@gracious.tech/fetch-client'`. This will use the published ESM form which supports tree-shaking.

If you can't use a bundler for some reason, you can also:

 * Deploy `dist/bundled.mjs` and import it in a `<script type='module'>`
 * Deploy `dist/bundled.iife.js` and include it via a regular `<script src='...'>`
    * It will create a `fetch_client` global variable, so you can access `fetch_client.BibleClient`

### Node (18+)

It is recommended to use ESM import/export syntax by setting `"type": "module"` in your `package.json`. You can then:

`import {BibleClient} from '@gracious.tech/fetch-client'`

If you need to still use the old `require()` syntax for other modules, you can still use the ESM form via a dynamic import:

`import('@gracious.tech/fetch-client').then(({BibleClient}) => ...)`

or you can require the bundled CJS form with:

`const {BibleClient} = require('@gracious.tech/fetch-client')`


## Usage

The standard way to use the client is to start with a `new BibleClient()` and then call `fetch_collection()`, which will return a promise for a `BibleCollection` which you can use to explore all the languages and translations available, and then call `fetch_book(translation, book)` and similar methods to get access to actual Bible content.

Methods starting with `fetch_` will make a network request and return a promise, where as methods starting with `get_` do not and are synchronous. For methods that return a list (e.g. languages, translations) you can usually pass `{object: true}` in the options argument to have them return an object keyed by `id` instead.

If your code editor supports Typescript you'll get helpful auto-suggestions that explain all the methods and arguments possible, or alternatively you can also explore the [auto-generated docs](api/classes/client.BibleClient.html).


### Example

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

// Fetch the contents of the first book
const book = await collection.fetch_book(translation_id, books[0].id)

// Output the HTML of the first chapter of the book
console.log(book.get_chapter(1))

```

<p><VPButton href='/access/client/example/' text="See more detailed example"></VPButton></p>


## Styles
The client includes a functional stylesheet, meaning styles that are minimalistic and critical for correct display. If you don't include this in your project then, for example, footnotes etc. are going to appear inline and undistinguishable from actual scripture.

If you use a tool like Webpack or Vite then you'll simply need to `import '@gracious.tech/fetch-client/client.css'` in a Javascript module, or you could alternatively deploy it with your code and use a `<link>` element to include it.

All styles are namespaced under the class `fetch-bible` and all subclasses are prefixed with `fb-` so that it won't affect your existing styles and they also are unlikely to affect fetch(bible) HTML. So you must embed fetch(bible) HTML under a container element with the class `fetch-bible`.

The following classes can be added to your `.fetch-bible` container element:

Class               | Effect
| -                 | -
`.fb-plain`         | Disables the more opinionated aspects of the styles so you can more easily customise them to suit your situation. E.g. Disables fading of verse numbers, chapter heading styling, notes show-on-hover, etc
`.fb-no-verses`     | Hides verse numbers
`.fb-no-chapters`   | Hides chapter headings
`.fb-no-headings`   | Hides section headings
`.fb-no-notes`      | Hides translation notes
`.fb-no-red-letter` | Disables coloring words of Jesus in red (for translations that support it)

The `.fetch-bible` class also has some variables you can customise:

Variable                        | Default           | Description
| -                             | -                 | -
`--fb-red-letter`               | `hsl(0, 60%, 50%)`| The color of Jesus' words (for translations that support it). Be sure to choose a color that works for both light & dark backgrounds.
`--fb-alt-italic-filter`        | `opacity(0.85)`   | A CSS filter to apply to text that would normally be displayed in italics, for use when italics aren't suitable for a language's script.
`--fb-alt-bold-filter`          | `contrast(2)`     | A CSS filter to apply to text that would normally be displayed in bold, for use when bold isn't suitable for a language's script.
`--fb-alt-bold-italic-filter`   | `drop-shadow(0 0 5px hsl(0, 50%, 0%))` | A CSS filter to apply to text that would normally be displayed in bold+italics, for use when bold+italics isn't suitable for a language's script.


## Design
This client has zero dependencies, no differences between the browser and Node versions (no unused code), and is overall very small and fast. It only connects to the endpoints you specify so can be used completely independently of the official fetch(bible) service.
