
# Manual access

It's recommended to use the official client if able to save you a lot of time, but fetch(bible) can also be accessed manually if the need arises. For example, you may want to access the collection via a language other than Javascript.

## Manifest
There is a single JSON document that contains all the metadata for all Bible translations. You can [inspect the structure](https://collection.fetch.bible/bibles/manifest.json) and parse it as needed.

## Sources
If you need the original source files for Bible translations they are available in the [official collection](https://github.com/gracious-tech/fetch_collection) repository.

## Available formats
All bibles are provided in USX 3+, USFM, HTML, and plain text:
 * `https://collection.fetch.bible/bibles/{id}/usx/{book}.usx`
 * `https://collection.fetch.bible/bibles/{id}/usfm/{book}.usfm`
 * `https://collection.fetch.bible/bibles/{id}/html/{book}.html`
 * `https://collection.fetch.bible/bibles/{id}/txt/{book}.txt`

The HTML is a custom format designed to be used with the provided stylesheet, but the structure is self-explanatory and matches USX as closely as possible. The plain text excludes all non-biblical content (such as headings) but does include verse markers (e.g. `[2]`), which can be easily removed if desired.

Book ids [match the USX standard](https://ubsicap.github.io/usx/vocabularies.html#usx-vocab-bookcode) but are lowercase only.
