
# Collections

Collections are the content sources that clients access and fetch(bible) has an official collection that we maintain, but you can also create your own collection if you desire.

The official collection is at: https://collection.fetch.bible/

## Custom collections
You can create your own collection to either complement or replace the official one. This may be necessary if for example:
 * You want to package translations within an app
 * You've been granted access to restricted translations

You can still use the fetch(bible) client with your own collection by passing it your own endpoint. The order of endpoints determines their priority and the client will discover translations from as many endpoints as you provide it with.

## collector

[This has not yet been published to NPM]
<!-- `npm install @gracious.tech/fetch-collector` -->

The collector is a Node CLI for managing a collection. It's used to manage the official fetch(bible) collection, and you can use it to create your own as well.

While you can technically use it to recreate the official collection, it is better to clone our existing collection rather than start from scratch, as there is a lot of meta data that has been manually improved.

Run `npx fetch-collector --help` for usage.
