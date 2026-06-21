
import fs from 'node:fs'
import {join, sep} from 'node:path'

import {concurrent, type_from_path, read_dir_deep, read_json} from '../parts/utils.js'
import {read_unpublished, clear_unpublished, mark_all_unpublished} from './unpublished.js'
import type {DistManifest} from './shared_types'


// Categories that are keyed by resource id in the manifest (and reconciled against it)
const RESOURCE_CATEGORIES = ['bibles', 'glosses', 'notes'] as const


export abstract class Publisher {
    // Interface for publishing collection to server

    abstract upload(key:string, body:Buffer|string, type:string): Promise<void>
    abstract invalidate(paths:string[]): Promise<void>
    abstract delete_dir(path:string):Promise<void>
    // Delete the given object keys from the server
    abstract delete_files(keys:string[]):Promise<void>
    // List immediate subdir names under a server prefix (e.g. 'bibles' -> ['aai_wbt', ...])
    abstract list_server_dirs(prefix:string):Promise<string[]>
    // List all object keys under a server prefix (recursive)
    abstract list_server_files(prefix:string):Promise<string[]>
    // Return HTML for the dynamic directory index page (S3 API-powered)
    abstract generate_dynamic_index():string

    // Upload a single file
    // WARN This doesn't update the parent dir's index (since should do after all children done)
    async upload_file(path:string):Promise<void>{
        const server_path = path.slice('dist/'.length)
        await this.upload(server_path, fs.readFileSync(path), type_from_path(path))
    }

    // Upload all files in dir, deleting any remote files under it that no longer exist locally
    // WARN This doesn't update the parent dir's index (since should do after all children done)
    async upload_dir(dir:string):Promise<void>{
        const dir_contents = read_dir_deep(dir)

        // Server keys for the local files (used to detect remote-only stale files)
        const server_prefix = dir.slice('dist/'.length).replaceAll(sep, '/')
        const local_keys = new Set(dir_contents.files.map(
            path => path.slice('dist/'.length).replaceAll(sep, '/')))

        // Upload files
        await concurrent(dir_contents.files.map(path => async () => {
            await this.upload_file(path)
        }))

        // Delete any remote files under this dir that no longer exist locally
        const stale = (await this.list_server_files(server_prefix))
            .filter(key => !local_keys.has(key))
        if (stale.length){
            console.info(`Deleting ${stale.length} stale file(s) under ${server_prefix}`)
            await this.delete_files(stale)
        }
    }

    // Publish the manifest
    async publish_manifest():Promise<string[]>{
        const manifest_path = join('dist', 'manifest.json')

        // Minify before upload (local file stays indented for readability)
        const manifest_indented = fs.readFileSync(manifest_path, {encoding: 'utf8'})
        const manifest_minified = JSON.stringify(JSON.parse(manifest_indented))
        await this.upload('manifest.json', manifest_minified, 'application/json')

        // Also upload to old location for clients < 1.1.0 with old prop name for bibles
        // This won't be listed in index.html
        const manifest_legacy = manifest_minified.replace('"bibles":{', '"translations":{')
        await this.upload('bibles/manifest.json', manifest_legacy, 'application/json')
        return ['/manifest.json', '/bibles/manifest.json']
    }

    // Publish changed resources, reconcile the server against the manifest, then upload manifest
    // NOTE The manifest (regenerated just before this runs) is the source of truth for which
    //      resources should exist on the server. unpublished.txt is only a hint for what changed
    //      and may be unreliable, so the manifest is what governs both uploads and deletions.
    async publish(force=false){
        if (force){
            mark_all_unpublished()
        }
        const unpublished = read_unpublished()
        if (!unpublished.length){
            console.info("Nothing unpublished — only refreshing manifest")
        }

        // Collect the valid resource ids per category from the freshly-generated manifest
        const manifest = read_json<DistManifest>(join('dist', 'manifest.json'))
        const valid_ids = new Map<string, Set<string>>()
        for (const category of RESOURCE_CATEGORIES){
            valid_ids.set(category, new Set(Object.keys(manifest[category])))
        }

        const invalidations:string[] = []
        const touched_categories = new Set<string>()

        // Upload (or delete) each changed resource tracked in unpublished.txt
        for (const entry of unpublished){
            const dist_path = join('dist', entry)
            const server_path = entry.replaceAll(sep, '/')
            const [category, id] = server_path.split('/')

            // Never publish a resource that isn't in the manifest
            // NOTE Such a resource, if already on the server, is removed by the reconcile below
            const category_valid_ids = category ? valid_ids.get(category) : undefined
            if (category_valid_ids && id && !category_valid_ids.has(id)){
                console.info(`Skipping (not in manifest): ${entry}`)
                continue
            }

            if (category){
                touched_categories.add(category)
            }

            if (fs.existsSync(dist_path)){
                console.info(`Publishing: ${entry}`)
                await this.upload_dir(dist_path)
            } else {
                console.info(`Deleting: ${entry}`)
                await this.delete_dir(server_path)
            }
            invalidations.push(`/${server_path}/*`)
        }

        // Reconcile each resource category against the manifest, removing server orphans
        // NOTE Independent of unpublished.txt, so stale server state (old publish logic) is fixed
        for (const [category, category_valid_ids] of valid_ids){
            for (const id of await this.list_server_dirs(category)){
                if (!category_valid_ids.has(id)){
                    console.info(`Deleting (not in manifest): ${category}/${id}`)
                    await this.delete_dir(`${category}/${id}`)
                    invalidations.push(`/${category}/${id}/*`)
                    touched_categories.add(category)
                }
            }
        }

        // Add category paths to invalidations (CloudFront will serve the dynamic index page)
        for (const category of touched_categories){
            invalidations.push(`/${category}/`)
        }

        // All resources are now synced — safe to upload manifest
        invalidations.push(...await this.publish_manifest())

        // Upload the single dynamic directory index page (served by CloudFront for all 404s)
        await this.upload('_dynamic_index.html', this.generate_dynamic_index(), 'text/html')
        invalidations.push('/_dynamic_index.html')
        invalidations.push('/')

        await this.invalidate(invalidations)

        // Clear tracking file only after everything succeeded
        clear_unpublished()
    }
}
