#!/usr/bin/env node

import yargs from 'yargs'

import {gen_language_data} from './parts/languages.js'
import {report_items, report_unprocessed} from './parts/reporting.js'
import {publish} from './parts/publish.js'
import {serve} from './parts/serve.js'
import {update_dist, update_source} from './parts/content.js'
import {update_bmc} from './parts/bmc.js'
import {init_config} from './parts/config.js'
import {update_manifest} from './parts/manifest.js'
import {discover_translations} from './parts/discover.js'
import {notes_process} from './notes/notes.js'
import {crossref_process} from './data/crossref.js'

import './parts/console_colors.js'


// Process CLI args
await yargs(process.argv.slice(2))
    .scriptName('fetch-collector')

    .command('setup', "Setup new collection", {},
        async argv => {await Promise.all([init_config(), gen_language_data(), update_bmc()])})
    .command('setup-data', "Update data on world's languages", {},
        argv => gen_language_data())
    .command('setup-bmc [version]', "Update Bible Multi Converter", {},
        argv => update_bmc(argv['version'] as string))

    // Bibles
    .command('discover [service] [id]', "Discover what translations are available", {},
        argv => discover_translations(argv['service'] as string, argv['id'] as string))

    .command('download [id]', "Download source files for translations", {},
        argv => update_source(argv['id'] as string))

    .command('process [id]', "Convert source files to distributable formats", {},
        argv => update_dist(argv['id'] as string))
    .command('process-manifest', "Update manifest (without updating actual translations)", {},
        argv => update_manifest())

    .command('serve [port]', "Serve the collection for testing", {},
        argv => serve(argv['port'] ? parseInt(argv['port'] as string) : undefined))

    .command('publish [id]', "Publish translations to server", {},
        argv => publish(argv['id'] as string))

    .command('report', "Report the status of included translations", {},
        argv => report_items())
    .command('report-unreviewed', "Report translations needing review", {},
        argv => report_items('unreviewed'))
    .command('report-missing', "Report translations missing metadata", {},
        argv => report_items('missing'))
    .command('report-unprocessed', "Report translations yet to be processed", {},
        argv => report_unprocessed())

    // Notes
    .command('notes-process', "Convert study notes to standard format", {}, argv => notes_process())

    // Data
    .command('data-crossref', "Generate cross-references data", {}, argv => crossref_process())

    // Show help when no command
    .demandCommand()
    .strict()
    .help()

    // Trigger processing
    .argv
