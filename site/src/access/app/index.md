
<style lang='sass' scoped>
iframe
    width: 100%
    height: 700px
    @media (max-width: 1000px)
        height: 400px
    border-style: none
</style>


# Web app (UI)

The fetch(bible) web app is a generic bible reading app that can be directly embedded as an iframe and interacted with via Javascript `postMessage` calls.

## Example
This is the web app embedded as an iframe, just like you can do in any other app or website (though it's easier to use when fullscreen):

    <iframe src='https://app.fetch.bible'></iframe>

<iframe src='https://app.fetch.bible'></iframe>


## Features

 * Works offline
 * Easy book & chapter selection
 * Swipe to change chapter
 * Scroll through entire books
 * Compare translations
 * Bilingual mode (both landscape and portrait)
 * Customise font and size
 * Private (no tracking of individuals)

__Coming soon:__

 * Search
 * Audio


## Interaction
With Javascript `postMessage` calls to the iframe you can customise the app's appearance to suit your own product, know what part of the Bible the user is reading, and navigate to a verse, etc.

Details coming soon...

## Forking
You can also fork the app as a base for a new fully-customised app of your own. It's written in Typescript/Vue, and available in the fetch(bible) [source code](https://github.com/gracious-tech/fetch/tree/master/app).

The downside of forking is there will be some translations that you won't have access to, because the owners have only given permission for them to be used in official Gracious Tech products.
