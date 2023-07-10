
import {readdirSync} from 'fs'


export function generate_index_file(path:string):string{
    // Generate a HTML index file for given directory
    /* TODO Requirements:
        * List files and folders separately
        * Display in two columns (folders | files) so can see both even if lists very long
        * Standard ASCII sorting (.sort() is fine)
        * Show size of files in bytes (2,000 bytes rather than 2 KB) for easier comparison
        * Show number of items in folders (will have to readDir for each)
        * Do as efficiently as possible with least reads (though not overly important)
        * All items are links
        * Include breadcrumb links at top to step up to each parent, all the way to root
        * Monospace font, and right-align numbers
        * Dir paths should always end in a slash
    */
    return ''
}


interface UpdateIndexesReturn {
    update:{path:string, html:string}[]
    remove:string[]
}

export function update_indexes(modified:string[], removed:string[]):UpdateIndexesReturn{
    // Determine what updates are needed for published dir index files
    /* TODO Requirements:
        This function takes a list of files in collection that have been modified or removed.
        The files can be anywhere in the collection, in nested dirs.
        If a file has been modified, need to update the index for its parent
            e.g. bibles/eng_bsb/html/1ch.html -> Regenerating bibles/eng_bsb/html/
        If a file has been removed, may need to remove its parent index
            But should readDir the parent to see if other files still exist, and regenerate it if so
        Dir paths should always end in a slash and shoudn't include 'index.html'
    */

    // Return list of indexes that need publishing and/or removing
    // Will then update or remove them from S3
    return {
        update: [],
        remove: [],
    }
}
