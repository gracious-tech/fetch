# fetch(bible)

All the source code for everything [fetch(bible)](https://fetch.bible).


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
