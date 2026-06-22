
// Generate an S3-API-powered directory index page for browser-side rendering

export function generate_dir_index_content(bucket:string, region:string):string {
    // Returns a single generic HTML page that uses JS to list any S3 directory via the public API
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {
            font-family: monospace, monospace;
            font-size: 16px;
            background-color: black;
            color: #ddd;
        }
        a {
            color: #c12bdb;
            text-decoration: none;
        }
        #breadcrumbs ul {
            padding: 10px 16px;
            list-style: none;
            background-color: #333;
        }
        #breadcrumbs ul li {
            display: inline;
            font-size: 18px;
        }
        #breadcrumbs ul li+li:before {
            padding: 8px;
            color: #fff3;
            content: '⟩';
        }
        th, td {
            border-bottom: 1px solid #fff3;
        }
        th, td {
            padding: .5rem;
        }
        table {
            border-collapse: collapse;
        }
        td:nth-child(1), td:nth-child(3) {
            width: 300px;
        }
        td:nth-child(2), td:nth-child(4) {
            width: 200px;
            text-align: end;
        }
        #status {
            padding: 1rem;
            color: #888;
        }
    </style>
</head>
<body>
    <div id="breadcrumbs"></div>
    <div id="status">Loading...</div>
    <div id="content"></div>
    <script>
        const BUCKET = '${bucket}'
        const REGION = '${region}'

        // Render breadcrumbs from the current path
        function render_breadcrumbs(path) {
            const pieces = path.split('/').filter(p => p)
            let crumb_path = '/'
            const crumbs = ['<li><a href="/">/</a></li>']
            for (const piece of pieces) {
                crumb_path += piece + '/'
                const href = crumb_path
                crumbs.push('<li><a href="' + href + '">' + piece + '</a></li>')
            }
            // Mark last item as non-link
            const last = crumbs.pop()
            crumbs.push(last.replace('<a href="' + crumb_path + '">', '<span class="last">').replace('</a>', '</span>'))
            document.getElementById('breadcrumbs').innerHTML = '<ul>' + crumbs.join('') + '</ul>'
        }

        // Format byte count for display
        function format_size(bytes) {
            return Number(bytes).toLocaleString() + ' bytes'
        }

        // Fetch and render the S3 directory listing for the current path
        async function render_listing(path) {
            const prefix = path.slice(1)  // Remove leading slash
            const url = 'https://' + BUCKET + '.s3.' + REGION + '.amazonaws.com/'
                + '?list-type=2&delimiter=%2F&prefix=' + encodeURIComponent(prefix)
            const resp = await fetch(url)
            if (!resp.ok) {
                document.getElementById('status').textContent = 'Error loading directory: ' + resp.status
                return
            }
            const xml = new DOMParser().parseFromString(await resp.text(), 'application/xml')

            // Extract dirs (CommonPrefixes) and files (Contents, excluding the prefix itself)
            const dirs = [...xml.querySelectorAll('CommonPrefixes Prefix')].map(el => {
                const full = el.textContent
                return full.slice(prefix.length, -1)  // Strip prefix and trailing slash
            })
            const files = [...xml.querySelectorAll('Contents')].filter(el => {
                return el.querySelector('Key').textContent !== prefix  // Exclude the dir itself
            }).map(el => ({
                name: el.querySelector('Key').textContent.slice(prefix.length),
                size: el.querySelector('Size').textContent,
            }))

            // Build table rows (dirs and files side by side)
            const max = Math.max(dirs.length, files.length)
            if (max === 0) {
                document.getElementById('status').textContent = 'Empty directory'
                return
            }
            const rows = []
            for (let i = 0; i < max; i++) {
                const dir = dirs[i]
                const file = files[i]
                const dir_cell = dir ? '<a href="./' + dir + '/">' + dir + '</a>' : ''
                const file_cell = file ? '<a href="./' + file.name + '">' + file.name + '</a>' : ''
                const size_cell = file ? format_size(file.size) : ''
                rows.push('<tr><td>' + dir_cell + '</td><td></td><td>' + file_cell + '</td><td>' + size_cell + '</td></tr>')
            }

            document.getElementById('status').textContent = ''
            document.getElementById('content').innerHTML = '<table>'
                + '<thead><tr><th>Folders</th><th></th><th>Files</th><th>Size</th></tr></thead>'
                + '<tbody>' + rows.join('') + '</tbody></table>'
        }

        // Main: show listing for dir paths, not-found message for file paths
        const path = window.location.pathname
        render_breadcrumbs(path)
        if (path.endsWith('/')) {
            render_listing(path)
        } else {
            document.getElementById('status').textContent = 'Not found: ' + path
        }
    </script>
</body>
</html>`
}
