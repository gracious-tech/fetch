
import {existsSync, rmSync, unlinkSync, renameSync} from 'fs'
import {join} from 'path'

import {list_dirs, list_files, read_json, write_json} from '../parts/utils.js'
import {add_unpublished} from '../parts/unpublished.js'


export async function clean_collection(){

    const changed_ids:string[] = []

    // Remove dist dir for translation if source dir has been removed
    const trans_ids = list_dirs(join('sources', 'bibles'))
    for (const id of list_dirs(join('dist', 'bibles'))){
        if (!trans_ids.includes(id)){
            rmSync(join('dist', 'bibles', id), {recursive: true})
            changed_ids.push(id)
        }
    }

    // Remove dist books if src books do not exist or are invalid
    for (const id of list_dirs(join('sources', 'bibles'))){
        const src_format = existsSync(join('sources', 'bibles', id, 'usx')) ? 'usx' : 'usfm'
        const books = list_files(join('sources', 'bibles', id, src_format))
            .filter(b => !b.endsWith('.invalid'))
            .map(b => b.slice(0, 3))
        let removed = false
        for (const format of ['usx', 'usfm', 'html', 'txt']){
            for (const file of list_files(join('dist', 'bibles', id, format))){
                if (!books.includes(file.slice(0, 3))){
                    unlinkSync(join('dist', 'bibles', id, format, file))
                    removed = true
                }
            }
        }
        if (removed){
            changed_ids.push(id)
        }
    }

    if (changed_ids.length){
        add_unpublished(changed_ids.map(id => `bibles/${id}`))
    }
}


// Create indented copy of manifest in root dir for easier comparison
export function inspect_manifest(){

    // If a copy already exists, rename it to old
    if (existsSync('manifest-new.json')){
        renameSync('manifest-new.json', 'manifest-old.json')
    }

    // Create indented copy of current manifest
    const manifest = read_json(join('dist', 'manifest.json'))
    write_json('manifest-new.json', manifest, true)

    console.info("Inspect with: git diff --no-index manifest-old.json manifest-new.json | less")
}
