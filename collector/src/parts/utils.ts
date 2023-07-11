
import {Dirent, mkdirSync, readFileSync, readdirSync, rmSync} from 'fs'
import {dirname, join} from 'path'

/**
 * Files to ignore when reading a directory
 */
const IGNORE_FILES = ['.DS_Store']

export async function request<T>(url:string, type?:'json'):Promise<T>
export async function request(url:string, type:'text'):Promise<string>
export async function request(url:string, type:'blob'):Promise<Blob>
export async function request(url:string, type:'arrayBuffer'):Promise<ArrayBuffer>
export async function request(url:string, type:'json'|'blob'|'arrayBuffer'|'text'='json'):
        Promise<unknown>{
    // Simple wrapper around fetch
    const resp = await fetch(url)
    if (!resp.ok){
        throw new Error(`${resp.status} ${resp.statusText}: ${url}`)
    }
    return resp[type]() as Promise<unknown>
}


export async function concurrent(tasks:(()=>Promise<unknown>)[], limit=10):Promise<void>{
    // Complete the given tasks concurrently and return promise that resolves when all done
    // NOTE Upon failure this will reject and stop starting tasks (though some may still be ongoing)

    // Create an array to represent channels and default to already resolved promises
    // NOTE Any promises added to channels must resolve to the channel id (array index)
    const channels = [...Array(limit).keys()].map(i => Promise.resolve(i))

    // Add tasks to channels whenever one free
    for (const task of tasks){
        // Wait till at least one channel is free
        const free_channel = await Promise.race(channels)
        channels[free_channel] = task().then(() => {
            // Return channel so next task knows which is free
            return free_channel
        })
    }

    // Wait till all the tasks have been completed
    await Promise.all(channels)
}


export function clean_dir(path:string):void{
    // Ensure dir exists and is empty
    rmSync(path, {force: true, recursive: true})
    mkdirSync(path, {recursive: true})
}


/**
 * Read the directory and pass back the names of the entries. This is a wrapper to ignore
 * specific files.
 *
 * @param path The path to read
 * 
 * @returns The entry names
 */
export function read_dir(path:string):string[] {
    return readdirSync(path).filter(item => !IGNORE_FILES.includes(item))
}


/**
 * Read the directory and pass back the directory entries.  This is a wrapper to ignore
 * specific files.
 *
 * @param path The path to read
 * 
 * @returns The directory entries
 */
export function read_dir_with_types(path:string):Dirent[] {
    return readdirSync(path, {withFileTypes: true})
        .filter(item => !IGNORE_FILES.includes(item.name))
}


export function read_json<T>(path:string):T{
    // Read a JSON file and cast as given type
    return JSON.parse(readFileSync(path, 'utf-8')) as T
}


// Absolute path to package's root dir
// NOTE Since dealing with a URL, separator is always '/' and 'file:/' is prepended
export const PKG_PATH =
    dirname(dirname(dirname(join('/', ...import.meta.url.slice('file:/'.length).split('/')))))


export function type_from_path(path:string){
    // Determine content type from path (supporting only types relevant to collections)
    if (path.endsWith('.usx')){
        return 'application/xml'
    } else if (path.endsWith('.usfm')){
        return 'text/plain'
    } else if (path.endsWith('.html')){
        return 'text/html'
    } else if (path.endsWith('.txt')){
        return 'text/plain'
    } else if (path.endsWith('.json')){
        return 'application/json'
    }
    return 'application/octet-stream'
}
