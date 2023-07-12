
import { partition } from 'lodash-es'
import * as path from 'path'
import { readdirSync } from 'fs'
import { DirectoryEntry, get_dir_entries, read_files_in_dir } from './utils.js'


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

/**
 * Using the provided values, we tell S3 with index files need to be updated.
 *
 * @param modified The files that have been modified
 * @param removed The files that have been removed
 *
 * @returns The data needed to update S3
 */
export function update_indexes(modified:string[], removed:string[]): UpdateIndexesReturn {
    // This map stores the removed directory (key), and the first parent that has content (value).
    // This is used to illiminate the need to readdirSync multiple times
    const first_full_parents = new Map<string, string>()
    // Build the removals
    const removals: string[] = removed.flatMap((entry: string) => {
        let parent = path.dirname(entry)
        const removed = []
        // Loop until we get to the top directory
        while (parent !== '.') {
            const total = read_files_in_dir(parent).length
            first_full_parents.set(entry, parent)
            if (total === 0) {
                removed.push(`${parent}/`)
            } else {
                // If a directory has files, then it's parents will also have it
                break
            }
            parent = path.dirname(parent)
        }
        return removed
    })
    const modified_handle_paths: string[] = modified.map((file: string) => `${path.dirname(file)}/`)
    // All removed paths should include the parent and grandparent path
    const removed_handle_paths: string[] = removed
        .flatMap((file: string) => {
            const full_parent = first_full_parents.get(file)
            if (!full_parent) {
                return []
            }
            return [`${full_parent}/`, `${path.dirname(full_parent)}/`]
        })
    // Create an array by merging the arrays, and keep only unique paths
    const handle_paths = [...new Set([...modified_handle_paths, ...removed_handle_paths])]
    // Build the updates
    const updates: {path:string, html:string}[] = handle_paths
        .map((directory: string) => {
            // Path should use the standard /
            return {
                path: directory.replaceAll(path.sep, '/'),
                html: generate_index_content(directory, ['dist']),
            }
        })
    return {
        update: updates,
        remove: removals,
    }
}
