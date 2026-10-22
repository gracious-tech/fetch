
import {books_ordered} from '@gracious.tech/bible-references'

import {filter_licenses} from '../assets/licenses.js'
import {BibleCollection} from './bibles.js'
import {GlossesCollection} from './glosses.js'
import {NotesCollection} from './notes.js'

import type {DistManifest, MetaCopyright, MetaStandardLicense, OneOrMore}
    from '../assets/shared_types.js'
import type {UsageConfig, RuntimeManifest, RuntimeLicense} from '../assets/types.js'
import type {RequestHandler} from '../assets/request.js'


// Access to a collection's meta data, including languages and resources available
export class FetchCollection {

    // @internal
    _usage:UsageConfig
    // @internal
    _manifest:RuntimeManifest

    requester:RequestHandler
    bibles:BibleCollection
    glosses:GlossesCollection
    notes:NotesCollection

    // @internal
    constructor(usage:UsageConfig, requester:RequestHandler,
            manifests:OneOrMore<[string, DistManifest]>){
        // Merge the manifests given into a combined collection while remembering endpoints
        // WARN Original manifests are not dereferenced and assumed to not be used outside here

        this._usage = usage
        this.requester = requester

        // Start with an empty manifest with common metadata extracted from first manifest
        this._manifest = {
            bibles: {},
            glosses: {},
            notes: {},
            languages: {},
            language2to3: {},
            // The following are the same in all manifests
            languages_most_spoken: manifests[0][1].languages_most_spoken,  // Not filtered like ^
            licenses: manifests[0][1].licenses,
        }

        // Process manifests in reverse such that the first will have priority
        const manifests_reversed = [...manifests].reverse()  // reverse() modifies original
        for (const [endpoint, manifest] of manifests_reversed){

            // Combine language data
            Object.assign(this._manifest.languages, manifest.languages)
            Object.assign(this._manifest.language2to3, manifest.language2to3)

            // Loop through endpoint's resources
            const resource_types = ['bibles', 'glosses', 'notes'] as const
            for (const type of resource_types){
                for (const [resource, resource_data] of Object.entries(manifest[type])){

                    // Get data for licenses compatible with _usage
                    const licenses = resolve_license_data(manifest.licenses, this._usage,
                        resource_data.copyright)
                    if (!licenses.length){
                        continue  // No compatible licenses so exclude resource
                    }

                    // Add the resource to the combined collection
                    this._manifest[type][resource] = {
                        ...resource_data,
                        ...resolve_books(resource_data.books_ot, resource_data.books_nt),
                        copyright: {
                            ...resource_data.copyright,
                            licenses,
                        },
                        endpoint,
                    }
                }
            }
        }

        // Init resource subcollections
        this.bibles = new BibleCollection(
            this._manifest.bibles,
            this.requester,
            this._manifest.languages,
            this._manifest.language2to3,
            this._manifest.languages_most_spoken,
            this._usage,
        )
        this.glosses = new GlossesCollection(
            this._manifest.glosses,
            this.requester,
            this._manifest.languages,
            this._manifest.language2to3,
            this._manifest.languages_most_spoken,
            this._usage,
        )
        this.notes = new NotesCollection(
            this._manifest.notes,
            this.requester,
            this._manifest.languages,
            this._manifest.language2to3,
            this._manifest.languages_most_spoken,
            this._usage,
        )
    }
}


// Resolve books data to list of books
function resolve_books(ot:true|string[], nt:true|string[]){
    // Work out exactly what books are included (interpret `true` for whole testament)
    return {
        books_ot_list: ot === true ? books_ordered.slice(0, 39) : ot,
        books_nt_list: nt === true ? books_ordered.slice(39) : nt,
    }
}


// Resolve raw license data to usable form
function resolve_license_data(standard_licenses:Record<string, MetaStandardLicense>,
        usage:UsageConfig, copyright:MetaCopyright){
    // NOTE An unknown standard license is skipped (sanitize_manifest normally removes these)
    const licenses = copyright.licenses.flatMap((item):RuntimeLicense[] => {
        if (typeof item.license === 'string'){
            const standard = standard_licenses[item.license]
            return standard ? [{
                id: item.license,
                name: standard.name,
                restrictions: standard.restrictions,
                url: item.url,
            }] : []
        } else {
            return [{
                id: null,
                name: "Custom license",
                restrictions: item.license,
                url: item.url,
            }]
        }
    })

    // Remove licenses not compatible with the given usage restrictions
    return filter_licenses(licenses, usage)
}
