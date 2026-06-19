// A simple dev server

import http from 'node:http'
import fs from 'node:fs'
import {join} from 'node:path'

import {type_from_path} from '../parts/utils.js'


export async function serve(port=8430){
    // Start a dev server for PWD/dist on given port

    // Setup the server
    const server = http.createServer((req, res) => {
        // Respond to a request

        // Log the request
        const time = new Date().toLocaleTimeString()
        console.info(`[${time}] ${req.method!} ${req.url!}`)

        // Required for every response
        res.setHeader('Access-Control-Allow-Origin', '*')  // Allow all CORS requests

        // Util for sending response
        function send(status:number, contents:string):void{
            res.writeHead(status)
            res.write(contents)
            res.end()
        }

        // Can only handle simple GET requests
        if (req.method !== 'GET' || !req.url){
            return send(400, "Request not supported")
        }

        // Turn the URL into a file path relative to PWD
        let path = decodeURIComponent(req.url.split('?')[0]!).slice(1)
        path = path ? join('dist', path) : 'dist/'  // Ensure dist ends with slash if no subpath

        // Serve file if it exists
        if (fs.existsSync(path) && fs.statSync(path).isFile()){
            res.setHeader('Content-Type', type_from_path(path))
            fs.createReadStream(path).pipe(res)
            return
        }

        return send(404, `Not found: ${req.url}`)
    })

    // Start listening
    server.listen(port, () => {
        console.info(`Listening on http://localhost:${port}`)
    })
}
