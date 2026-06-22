
import {existsSync, readdirSync, rmdirSync, rmSync, unlinkSync} from 'fs'
import {join} from 'path'

import {list_dirs, list_files} from '../parts/utils.js'
import {add_unpublished} from '../parts/unpublished.js'


export async function clean_collection(){

    // Remove empty source dirs
    for (const id of list_dirs(join('sources', 'bibles'))){
        if (!readdirSync(join('sources', 'bibles', id)).length){
            rmdirSync(join('sources', 'bibles', id))
        }
    }

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
        const src_dir = join('sources', 'bibles', id, src_format)
        if (!existsSync(src_dir)){
            continue
        }
        const books = list_files(src_dir)
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
