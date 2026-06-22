
import {Dirent, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'fs'
import {dirname, join} from 'path'

/**
 * Files/dirs to ignore when reading a directory
 */
const IGNORE_NAMES = ['.DS_Store', '.git']

/**
 * An interface for directory entries
 */
export interface DirectoryEntry {
    // Is it a directory
    isDirectory: boolean,
    // The name of the file
    name: string,
    // If it is a file, the size of the file.
    fileSize: number|undefined,
    // If it is a directory, the number of files in the directory.
    dirSize: number|undefined,
}


export async function request<T>(url:string, type?:'json', headers?:Record<string, string>):
    Promise<T>
export async function request(url:string, type:'text', headers?:Record<string, string>):
    Promise<string>
export async function request(url:string, type:'blob', headers?:Record<string, string>):
    Promise<Blob>
export async function request(url:string, type:'arrayBuffer', headers?:Record<string, string>):
    Promise<ArrayBuffer>
export async function request(url:string, type:'json'|'blob'|'arrayBuffer'|'text'='json',
        headers?:Record<string, string>):Promise<unknown>{
    // Simple wrapper around fetch with optional custom headers
    const resp = await fetch(url, headers ? {headers} : undefined)
    if (!resp.ok){
        const body = await resp.text().catch(() => '')
        throw new Error(`${resp.status} ${resp.statusText}: ${url}${body ? `\n${body}` : ''}`)
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


// Make sure a dir exists and don't throw if it does already
export function mkdir_exist(path:string):void{
    if (existsSync(path)){
        return
    }
    mkdirSync(path, {recursive: true})
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
    return readdirSync(path).filter(item => !IGNORE_NAMES.includes(item))
}


/**
 * Get directory entries for a given path
 *
 * @param path The path to read
 *
 * @returns The directory entries
 */
export function get_dir_entries(path:string):DirectoryEntry[] {
    return readdirSync(path, {withFileTypes: true})
        .filter((item: Dirent) => !IGNORE_NAMES.includes(item.name))
        .map((item: Dirent) => {
            const name = item.name
            const isDirectory = item.isDirectory()
            const fileSize = (isDirectory) ? undefined : statSync(join(path, name)).size
            const dirSize = (!isDirectory) ? undefined : readdirSync(join(path, name)).length
            const entry: DirectoryEntry = {
                isDirectory,
                name,
                fileSize,
                dirSize,
            }
            return entry
        })
}


// List files in dir
export function list_files(directory:string):string[]{
    return readdirSync(directory, {withFileTypes: true})
        .filter((entity: Dirent) => entity.isFile())
        .filter((entity: Dirent) => !IGNORE_NAMES.includes(entity.name))
        .map((entity: Dirent) => entity.name)
}


// List subdirs in dir
export function list_dirs(directory:string):string[]{
    return readdirSync(directory, {withFileTypes: true})
        .filter((entity: Dirent) => entity.isDirectory())
        .filter((entity: Dirent) => !IGNORE_NAMES.includes(entity.name))
        .map((entity: Dirent) => entity.name)
}


// List subdirs and return [] if dir doesn't exist
export function list_dirs_if(directory:string):string[]{
    if (!existsSync(directory))
        return []
    return list_dirs(directory)
}


// Get paths for all the files and subdirs in a containing dir (recursive)
export function read_dir_deep(directory:string):{dirs: string[], files: string[]}{
    const dirs:string[] = [directory]
    const files:string[] = []
    for (const entry of readdirSync(directory, {withFileTypes: true})){
        const entry_path = join(directory, entry.name)
        if (entry.isDirectory()){
            const subdir_results = read_dir_deep(entry_path)
            dirs.push(...subdir_results.dirs)
            files.push(...subdir_results.files)
            continue
        } else if (!entry.isFile() || IGNORE_NAMES.includes(entry.name)){
            continue
        }
        files.push(entry_path)
    }
    return {dirs, files}
}


export function read_json<T>(path:string):T{
    // Read a JSON file and cast as given type
    return JSON.parse(readFileSync(path, 'utf-8')) as T
}


export function write_json(path:string, data:unknown, indented=false){
    // Write stringified JSON data to a file
    writeFileSync(path, JSON.stringify(data, undefined, indented ? 4 : 0))
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


// Remove diacritics from a string
export function rm_diacritics(string:string):string{
    // See https://stackoverflow.com/a/37511463/10262211
    return string.normalize('NFKD').replace(/\p{Diacritic}/gu, '')
}


// Convert modern rendering of a greek/hebrew word to original, without diacritics/punctuation/etc
export function word_to_original(word:string){

    // Remove diacritics
    word = rm_diacritics(word)

    // Make uppercase (for Greek)
    word = word.toUpperCase()

    // Remove all punctuation and non-orig chars
    // Greek \u0391-\u03A9 = Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω
    // Hebrew \u05D0-\u05EA = א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר ש ת
    word = word.replace(/[^\u0391-\u03A9\u05D0-\u05EA]+/g, '')

    return word
}
