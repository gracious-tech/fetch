
import {join} from 'path'
import {readdirSync, readFileSync} from 'fs'

import {concurrent, read_json} from './utils.js'
import {PublisherAWS} from '../integrations/aws.js'
import type {DistManifest} from './shared_types'


function _type_from_path(path:string){
    // Determine content type from path
    if (path.endsWith('.usx')){
        return 'application/xml'
    } else if (path.endsWith('.usfm')){
        return 'text/plain'
    } else if (path.endsWith('.html')){
        return 'text/html'
    } else if (path.endsWith('.json')){
        return 'application/json'
    } else if (path.endsWith('.js') || path.endsWith('.mjs')){
        return 'text/javascript'
    }
    throw new Error(`Couldn't detect content type for: ${path}`)
}


export class Publisher extends PublisherAWS {
    // Interface for publishing collection to server

    async upload_files(paths:string[]){
        // Upload multiple files concurrently
        await concurrent(paths.map(path => async () => {
            await this.upload(path.slice('dist/'.length), readFileSync(path), _type_from_path(path))
        }))
    }

}


export async function publish(translation?:string):Promise<void>{
    // Publish collection (or part of it)


    // Detect translations from manifest so know they passed review
    const manifest_path = join('dist', 'bibles', 'manifest.json')
    const manifest = read_json<DistManifest>(manifest_path)

    // Add translations
    const files = []
    const invalidations = []
    for (const id in manifest.translations){
        if (translation && id !== translation){
            continue  // Only publishing a single translation
        }
        const usx_dir = join('dist', 'bibles', id, 'usx')
        const html_dir = join('dist', 'bibles', id, 'html')
        files.push(
            ...readdirSync(usx_dir).map(file => join(usx_dir, file)),
            ...readdirSync(html_dir).map(file => join(html_dir, file)),
        )
        invalidations.push(`/bibles/${id}/*`)
    }

    // Add manifest last so assets are ready before it is used
    files.push(manifest_path)
    invalidations.push('/bibles/manifest.json')

    // Publish
    const publisher = new Publisher()
    await publisher.upload_files(files)
    await publisher.invalidate(invalidations)
}
