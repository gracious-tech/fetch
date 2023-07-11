
import { partition } from 'lodash-es'
import * as path from 'path'
import {DirectoryEntry, get_dir_entries} from './utils.js'


/**
 * Generate the HTML content using the specific directory path content
 *
 * @param directory             The path to generate an index content for
 * @param exclude_breadcrumbs   An array of folders in the directory that should not be included
 *                              in the breadcrumbs
 *
 * @returns The html content
 */
export function generate_index_content(
        directory:string,
        exclude_breadcrumbs: string[] = [],
): string {
    // Create the breadcrumbs
    // Filter removes any empty values if the path.sep is at the end
    // Also remove any paths passed in exclude_breadcrumbs
    const pieces = directory
        .split(path.sep)
        .filter((n: string) => n)
        .filter((n: string) => !exclude_breadcrumbs.includes(n))
        .reverse()

    let crumb_path = ''
    const crumbs = []
    for (let index = 0; index < pieces.length; index++) {
        const crumb = pieces[index] ?? ''
        let li = ''
        if (index === 0) {
            // We are in reverse, so 0 is the last item
            li = `<li class="last">${crumb}</li>`
        } else {
            crumb_path += `../`
            li = `<li><a href="${crumb_path}">${crumb}</a></li>`
        }
        crumbs.push(li)
    }
    // Attach the root directory
    crumb_path += `../`
    crumbs.push(`<li><a href="${crumb_path}">/</a></li>`)
    const breadcrumbs = `<ul>${crumbs.reverse().join('')}</ul>`
    // Collect the files and folders from the given path
    const sorter = (a: DirectoryEntry, b: DirectoryEntry) => a.name.localeCompare(b.name)
    const contents = get_dir_entries(directory)
    // lodash partition seperates the array based on predicate
    // @link https://lodash.com/docs/4.17.15#partition
    const results = partition(contents, (content: DirectoryEntry) => content.isDirectory)
    const dirs = results[0].sort(sorter)
    const files = results[1].sort(sorter)
    // Now create a table with columns: folders | content size | files | file size
    const max = Math.max(dirs.length, files.length)
    const rows = []
    for (let index = 0; index < max; index++) {
        let folder_text = ''
        let folder_size = ''
        let file_text = ''
        let file_size = ''
        if (dirs[index] !== undefined) {
            const name = dirs[index]!.name
            folder_text = `<a href="./${name}/">${name}</a>`
            folder_size = `<span data-entry-name="${name}">${dirs[index]!.contentSize}</span>`
        }
        if (files[index] !== undefined) {
            const name = files[index]!.name
            file_text = `<a href="./${name}">${name}</a>`
            file_size = `<span data-entry-name="${name}">${files[index]!.fileSize.toLocaleString()} bytes</span>`
        }
        rows.push(`<tr>
            <td>${folder_text}</td>
            <td>${folder_size}</td>
            <td>${file_text}</td>
            <td>${file_size}</td>
        </tr>`)
    }
    const table = `<table class="entry-list">
        <thead>
            <tr>
                <th>Folders</th>
                <th>Total Files</th>
                <th>Files</th>
                <th>Size</th>
            </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
    </table>`
    // Return the HTML
    return `<!DOCTYPE html>
        <html>
            <style>
                body {
                    font-family: monospace, monospace;
                    font-size: 16px;
                }
                #breadcrumbs ul {
                  padding: 10px 16px;
                  list-style: none;
                  background-color: #eee;
                }
                #breadcrumbs ul li {
                  display: inline;
                  font-size: 18px;
                }
                #breadcrumbs ul li+li:before {
                  padding: 8px;
                  color: black;
                  content: '>';
                }
                #breadcrumbs ul li a {
                  color: #0275d8;
                  text-decoration: none;
                }
                #breadcrumbs ul li a:hover {
                  color: #01447e;
                  text-decoration: underline;
                }
                table, th, td {
                    border: 1px solid black;
                }
                th, td {
                    padding: .5rem;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                }
                td {
                    width: 25%;
                }
                td:nth-child(2), td:nth-child(4) {
                    text-align: end;
                }
            </style>
            <body>
                <div id="breadcrumbs">${breadcrumbs}</div>
                ${table}
            </body>
        </html>`
}


interface UpdateIndexesReturn {
    update:{path:string, html:string}[]
    remove:string[]
}

export function update_indexes(modified:string[], removed:string[]): UpdateIndexesReturn {
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
