
import {join} from 'path'
import {readdirSync, readFileSync} from 'fs'

import {concurrent} from './utils.js'
import {PublisherAWS} from '../integrations/aws.js'


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

    // Always update manifest since quick (and manifest almost always needs update)
    const files = [join('dist', 'bibles', 'manifest.json')]

    // Add translations
    for (const id of readdirSync(join('dist', 'bibles'))){
        if (id === 'manifest.json'){
            continue
        }
        if (translation && id !== translation){
            continue  // Only publishing a single translation
        }
        const usx_dir = join('dist', 'bibles', id, 'usx')
        const html_dir = join('dist', 'bibles', id, 'html')
        files.push(
            ...readdirSync(usx_dir).map(file => join(usx_dir, file)),
            ...readdirSync(html_dir).map(file => join(html_dir, file)),
        )
    }

    // Publish
    const publisher = new Publisher()
    await publisher.upload_files(files)
}
