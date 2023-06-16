# fetch(bible)

All the source code for everything [fetch(bible)](https://fetch.bible).

You should read all of the docs on the website before reading this, as they explain how the platform works. This is not a typical platform, as the hosted portion is simply static files and the "API" is really a client-side module that does things an API would usually do.


## Components

 * __collector:__ A node CLI for managing a private collection of Bible translations
 * __collection:__ A test collection that `.bin/collector` will generate during development
 * __client:__ A browser/Node module that can interact with a collection in an API-like way
 * __app:__ A simple generic Bible reading app that can be embedded in another website/app
 * __site:__ Website for fetch.bible that includes the documentation


## Development setup

If you want to use the platform for an app, check out the documentation on [how to use it](https://fetch.bible/access/). The following setup is only for developers who wish to improve the platform itself:

```bash

# Install modules
.bin/setup

# Setup a test collection with a few translations
# This will take 5-10 mins to discover and convert translations to required formats
.bin/test_collector

# Build the client which other components rely on
.bin/build_client

# Serve the collection
.bin/serve_collection

# Serve the app and/or site (while collection is still being served)
.bin/serve_app
.bin/serve_site
```
