
<style lang='sass' scoped>
iframe
    width: 100%
    height: 700px
    @media (max-width: 1000px)
        height: 400px
    border-style: none
</style>


# Web app (UI)

The fetch(bible) web app is a generic bible reading app that can be directly embedded as an iframe, customised, and interacted with via Javascript `postMessage` calls.

## Example
This is the web app embedded as an iframe, just like you can do in any other app or website (though it's easier to use when fullscreen):

    <iframe src='https://app.fetch.bible'></iframe>

<iframe src='https://app.fetch.bible'></iframe>


## Features

 * Works offline
 * Swipe to change chapter
 * Scroll through entire books
 * Show multiple translations (both landscape and portrait)
 * Private (no tracking of individuals)

__Coming soon:__

 * Customise font and size
 * Search
 * Audio


## Customisation
You can pass config to the iframe when it first loads via search params embedded within the `#` of the URL. They should be in the same format as regular search params (i.e. you can use `URLSearchParams` to create them).

**Example:** https://app.fetch.bible/#book=exo&verse=10:1&back=true&dark=true


## Interaction
You can use Javascript `postMessage` calls to the iframe to change the app's config at runtime and also get status updates about what passage the user is reading and some actions they take.

## Params
These are the params available for use in the URL `#` and/or `postMessage` calls:

Param           | Type          | Default   | Description
| -             | -             | -         | -
`dark`          | `true\|false` | `[auto]`  | Whether to force dark/light theme. Only use this if your app already has a theme setting that you want to sync with, and also update it by listening for changes via this app's own theme setting).
`status`        | `string`      | `[disabled]` | A status message to display in the toolbar (must be short and may get cut off).
`color`         | `#rrggbb`     | `#c12bdb` | A theme color for the app (must be in `#rrggbb` format).
`back`          | `true\|false` | `false`   | Whether to show a back button in the toolbar (only enable if you listen to back button clicks and act on them).
`button1_icon`  | `coordinates` | `[disabled]` | The icon to display for a custom button in the toolbar. It must be a string for an SVG `<path d="">` that must conform to a 48x48 viewport (any value from a [Material icon/symbol](https://fonts.google.com/icons) will work).
`button1_color` | `CSS color`   | `currentColor` | A color for the button's fill.
`trans`         | `lll_ttt`     | `[auto]`      | A translation to force use of (comma-separate for multiple). Must be a fetch(bible) id ([preview any translation](/content/bibles/) to find the id in the url).
`book`          | `bbb`         | `[auto]`      | A book to show (otherwise remembers last opened).
`verse`         | `chap:verse`  | `[auto]`      | A chapter and verse to show (otherwise remembers last viewed).


## Messages

### From the app
Every message sent from the iframe via `postMessage` contains the following data. The event type is the most important but every event also reports what the user is currently reading.

Property        | Type      | Description
| -             | -         | -
type            | `ready\|translation\|verse\|back\|button1\|dark` | The event type
languages       | `[string, ...]` | The three char language codes (ISO 639‑3) of the translations being viewed
translations    | `[string, ...]` | The translations currently being used (always at least one)
book            | `bbb`     | [USX bible book code](https://ubsicap.github.io/usx/vocabularies.html#usx-vocab-bookcode) (in lowercase)
chapter         | `number`    | Chapter number currently being viewed
verse           | `number`    | Verse number currently being viewed
dark            | `true\|false` | Whether the app's theme is dark (or light)

When the app is ready to receive messages it will emit the `ready` event. Whenever the user scrolls or changes book the `verse` event will emit (may be very frequent). Other events trigger for button clicks or other state changes.

### To the app
You can send the iframe a message with `{"type": "update", ...}` and add any of the config params you'd like to change.


## Offline support
The app will work offline by default on most devices, however there are some situations that it won't. If a user has disabled third-party cookies in their browser it can prevent iframes from caching responses (even though the app doesn't use any actual cookies).

You can work around this by:

 1. Forking and extending the app (rather than loading in an iframe)
 1. Loading in a webview in a native app (instead of via an iframe)


## Forking
You can also fork the app as a base for a new fully-customised app of your own. It's written in Typescript/Vue, and available in the fetch(bible) [source code](https://github.com/gracious-tech/fetch/tree/master/app).

The downside of forking is there will be some translations that you won't have access to, because the owners have only given permission for them to be used in official Gracious Tech products.
