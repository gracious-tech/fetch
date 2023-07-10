
import {join} from 'path'
import {readFileSync} from 'fs'

import {concurrent, read_json, type_from_path, read_dir} from './utils.js'
import {PublisherAWS} from '../integrations/aws.js'
import type {DistManifest} from './shared_types'


export class Publisher extends PublisherAWS {
    // Interface for publishing collection to server

    async upload_files(paths:string[]){
        // Upload multiple files concurrently
        await concurrent(paths.map(path => async () => {
            await this.upload(path.slice('dist/'.length), readFileSync(path), type_from_path(path))
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
        const usfm_dir = join('dist', 'bibles', id, 'usfm')
        const html_dir = join('dist', 'bibles', id, 'html')
        const txt_dir = join('dist', 'bibles', id, 'txt')
        files.push(
            ...read_dir(usx_dir).map(file => join(usx_dir, file)),
            ...read_dir(usfm_dir).map(file => join(usfm_dir, file)),
            ...read_dir(html_dir).map(file => join(html_dir, file)),
            ...read_dir(txt_dir).map(file => join(txt_dir, file)),
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
