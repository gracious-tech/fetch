
<script setup>
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
</script>


::: warning fetch(bible) is in alpha!

While it is functional, there'll be numerous improvements coming and the API may change.

_Beta coming Q3 2022_
:::

&nbsp;


# How to access

You can use fetch(bible) however you like and we make it easy with a variety of methods of integration for whatever your situation may require.

### Choose your level of integration
<p>
    <VPButton href='/access/app/' text="UI" theme='alt'></VPButton>
    &nbsp;
    <VPButton href='/access/client/' text="API" theme='alt'></VPButton>
    &nbsp;
    <VPButton href='/access/manual/' text="Manual" theme='alt'></VPButton>
</p>


### Choose your source of content
<p>
    <VPButton href='/access/collections/' text="Official" theme='alt'></VPButton>
    &nbsp;
    <VPButton href='/access/collections/' text="Custom" theme='alt'></VPButton>
</p>


## No limits from us
While you can use our service however you like, you must still abide by the terms of each individual Bible translation. We make this easy by automatically including required attribution text, and allowing you to filter translations based on their restrictions.

Most translations will either be public domain or have a Creative Commons license.

## How it works

### It's a CDN
Bible translations are static content that doesn't change depending on who the user is, so a CDN is a much better choice for distribution as it eliminates delays due to authentication, request processing, and geographical location.

Since it's a CDN you can't limit the size of your request like you might be able to do with API queries. However, Bible translations are in plain text and compress very well. Whole books are requested individually and with brotli compression (that almost all browsers now have) the request size ranges from 1kb (2 John) to 85kb (Psalms), or 1.5MB for all books.

### But you can use it like an API
Fetch Bible comes with [a client](/access/client/) that allows accessing the CDN in an API-like way for a better developer experience. Or you can embed or extend the [official web app](/access/app/), or [manually access](/access/manual/) whatever you need. Feel free to cache responses for as long as you like too, and allow your users to access translations fully offline.
