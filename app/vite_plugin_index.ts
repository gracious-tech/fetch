// A vite plugin that supports writing index in Pug and embedding sass

import {readFileSync} from 'fs'

import pug from 'pug'
import sass from 'sass'
import {Plugin, ResolvedConfig} from 'vite'


export default function(template_path:string):Plugin{
    // Return config for plugin

    let config:ResolvedConfig
    const define_env:Record<string, string> = {}

    return {
        name: 'pug-index',

        configResolved(resolved_config){
            // Provide access to config when it's available
            config = resolved_config
            // Expose all the same env that vite does normally
            // WARN Defined values are inserted as code, not strings, hence `stringify()`
            for (const [key, val] of Object.entries(config.env)){
                define_env[`import.meta.env.${key}`] = JSON.stringify(val)
            }
        },

        transformIndexHtml: {
            // Replace default index contents with rendered pug template instead

            // Run before all core Vite plugins
            enforce: 'pre',

            async transform(html, context){
                // NOTE index.html is ignored as replacing entirely by index.pug
                // NOTE context.bundle will never be available because plugin runs 'pre' others
                const template = readFileSync(template_path, {encoding: 'utf-8'})
                return pug.compile(template, {
                    // NOTE pretty is deprecated and can cause bugs with dev vs prod
                    // WARN Filters cannot be async
                    filters: {

                        sass: (text:string, options:Record<string, unknown>) => {
                            // Render sass blocks
                            delete options['filename']  // Don't include pug-specific config
                            return sass.renderSync({
                                data: text,
                                indentedSyntax: true,
                                outputStyle: config.isProduction ? 'compressed' : 'expanded',
                                indentWidth: 4,
                                // NOTE Below can't be `true` so give a filename
                                sourceMap: config.isProduction ? false : 'index_sass.map',
                                sourceMapEmbed: true,
                                sourceMapContents: true,
                                ...options,
                            }).css.toString()
                        },

                    },
                })(config.env)  // Expose same env vars Vue does in templates
            },
        },

        handleHotUpdate(context){
            // Index changed whenever pug template does, so reload page
            // NOTE filename is absolute, so first make relative
            const filename = context.file.slice(context.server.config.root.length)
            if (filename === '/index.pug'){
                context.server.ws.send({type: 'full-reload'})
            }
        },

    }
}
