
# How to access


:::tip fetch(bible) continues to be improved
Signup to [Gracious Tech news](https://gracious.tech/contact) if you'd like to know when new features are added.
:::


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


## Available formats

### Normalized verse-based formats

Most developers will want to use these formats. They are organised by verse using the most common standard for verse numbering, so you can easily select the exact verse range you want. They guarantee all verses will exist, even if just an empty string (since many bibles exclude some verses to align with original manuscripts).

 * __HTML__ -- Standard HTML with custom classes for use with the fetch(bible) client stylesheet
 * __Plain text__ -- Text with double newlines for paragraphs and optionally Markdown syntax for headings and footnotes


### Raw paragraph-based formats

These formats provide raw access to translations with all of the metadata and extra-biblical content intact. You should only use these if you are familiar with them and know how to display them without confusing biblical text with metadata. They are paragraph-based, meaning paragraphs form the main structure of the documents, and verse markers occur within paragraphs. There is no guarantee all verses will be present.

 * __[USFM](https://ubsicap.github.io/usfm/)__ -- The most common format used to create translations, with a syntax similar to TeX where backslash'd tags are used to markup the text
 * __[USX](https://ubsicap.github.io/usx/)__ -- An XML format designed to support all the features of USFM, so it can be parsed with modern tooling


## Technical matters

### Completeness

Some Bible translations are incomplete, for various reasons. For example, critical texts only cover a single testament, many languages only have a New Testament, and some translations are works in progress.

This platform includes translations even if only one book is present. However, one thing we do require is that each book must include chapter 1. This is to avoid confusing users and developers who may otherwise think there is a bug with the platform or an app.


### Versification

All distributed formats use the modern standard for versification.

Most modern translations use the same system for numbering chapters and verses, [originally created by Robert Estienne](https://en.wikipedia.org/wiki/Chapters_and_verses_of_the_Bible#Verses) in 1551 AD and later popularized by the KJV.

Careful research into the original manuscripts has led many modern bibles to drop some verses that were originally included in older translations. However, to avoid confusing readers, the numbers of later verses remained the same, which is why some verses are "missing" today.

Bibles based on other manuscripts (such as the Septuagint) or from other Christian traditions (such as Orthodox and Catholic) were given somewhat [different systems of numbering verses](https://github.com/Copenhagen-Alliance/versification-specification/tree/master/versification-mappings/standard-mappings).

This platform uses the standard "KJV" numbering for all distributed formats. This allows developers to not have to deal with versification issues. If you do want the original versification for a certain translation, you can access its [source format](https://github.com/gracious-tech/fetch_collection).
