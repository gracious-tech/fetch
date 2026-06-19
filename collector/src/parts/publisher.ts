
import fs from 'node:fs'
import {join, sep} from 'node:path'

import {concurrent, type_from_path, read_dir_deep} from '../parts/utils.js'
import {read_unpublished, clear_unpublished, mark_all_unpublished} from './unpublished.js'


export abstract class Publisher {
    // Interface for publishing collection to server

    abstract upload(key:string, body:Buffer|string, type:string): Promise<void>
    abstract invalidate(paths:string[]): Promise<void>
    abstract delete_dir(path:string):Promise<void>
    // Return HTML for the dynamic directory index page (S3 API-powered)
    abstract generate_dynamic_index():string

    // Upload a single file
    // WARN This doesn't update the parent dir's index (since should do after all children done)
    async upload_file(path:string):Promise<void>{
        const server_path = path.slice('dist/'.length)
        await this.upload(server_path, fs.readFileSync(path), type_from_path(path))
    }

    // Upload all files in dir
    // WARN This doesn't update the parent dir's index (since should do after all children done)
    async upload_dir(dir:string):Promise<void>{
        const dir_contents = read_dir_deep(dir)

        // Upload files
        await concurrent(dir_contents.files.map(path => async () => {
            await this.upload_file(path)
        }))
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

    // Publish everything in unpublished.txt, then update the manifest
    async publish(force=false){
        if (force){
            mark_all_unpublished()
        }
        const unpublished = read_unpublished()
        if (!unpublished.length){
            console.info("Nothing unpublished — only refreshing manifest")
        }

        const invalidations:string[] = []
        const touched_categories = new Set<string>()

        for (const entry of unpublished){
            const dist_path = join('dist', entry)
            const server_path = entry.replaceAll(sep, '/')
            const category = server_path.split('/')[0]
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
