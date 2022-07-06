
# Manual access

It's recommended to use the official client if able to save you a lot of time, but fetch(bible) can also be accessed manually if the need arises.

## Manifest
There is a single JSON document that contains all the metadata for all Bible translations. You can [inspect the structure](https://collection.fetch.bible/manifest.json) and parse it as needed.

## Sources
If you need the original source files for Bible translations they are available at `https://collection.fetch.bible/bibles/{id}/source.zip`. They come in a variety of formats so are just provided as a zip archive.

## USX & HTML
All bibles are provided in both USX 3+ and HTML and can be accessed via:
 * `https://collection.fetch.bible/bibles/{id}/usx/{book}.usx`
 * `https://collection.fetch.bible/bibles/{id}/html/{book}.html`

The HTML is a custom format designed to be used with the provided stylesheet, but the structure is self-explanatory and matches USX as closely as possible.

Book ids [match the USX standard](https://ubsicap.github.io/usx/vocabularies.html#usx-vocab-bookcode) but are lowercase only.
