
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {list_dirs_if} from './utils.js'


// Path of the tracking file (lives above dist/, alongside config.yaml)
const UNPUBLISHED_FILE = 'unpublished.txt'


// Read the list of unpublished subdirs (relative to dist/)
export function read_unpublished():string[]{
    if (!existsSync(UNPUBLISHED_FILE)){
        return []
    }
    return readFileSync(UNPUBLISHED_FILE, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
}


// Append paths to the unpublished list, deduplicating
export function add_unpublished(paths:string[]):void{
    const existing = new Set(read_unpublished())
    for (const p of paths){
        existing.add(p)
    }
    writeFileSync(UNPUBLISHED_FILE, [...existing].join('\n') + '\n')
}


// Remove a single entry from the unpublished list (after it's been published)
// NOTE Rewrites the file each call so progress survives a crash mid-publish
export function remove_unpublished(entry:string):void{
    const remaining = read_unpublished().filter(p => p !== entry)
    if (remaining.length){
        writeFileSync(UNPUBLISHED_FILE, remaining.join('\n') + '\n')
    } else {
        rmSync(UNPUBLISHED_FILE, {force: true})
    }
}


// Remove the tracking file after a successful publish
export function clear_unpublished():void{
    rmSync(UNPUBLISHED_FILE, {force: true})
}


// Mark every subdir in dist as unpublished (used by force publish)
export function mark_all_unpublished():void{
    const entries:string[] = []
    for (const category of list_dirs_if('dist')){
        for (const id of list_dirs_if(join('dist', category))){
            entries.push(`${category}/${id}`)
        }
    }
    add_unpublished(entries)
}
