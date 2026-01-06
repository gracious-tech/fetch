
import {FetchClient, PassageReference} from '@gracious.tech/fetch-client'

import {markup_references} from './markup'


interface ConstructorOptions {
    default_theme?:boolean
    client?:FetchClient
    app_origin?:string
    app_args?:Record<string, string>
    history?:boolean
    translations?:string[]
    always_detect_english?:boolean
    before_history_push?:()=>void
}


export class BibleEnhancer {

    client:FetchClient
    _app_origin:string
    _app_args:string
    _app_div:HTMLDivElement
    _app_iframe:HTMLIFrameElement
    _history:boolean
    _translations:string[]
    _always_detect_english:boolean
    _before_history_push:()=>void
    _hover_divs:[HTMLDivElement, PassageReference][] = []
    // Detect whether device can hover (without emulation)
    _can_hover = self.matchMedia('(hover: hover)').matches

    constructor(options:ConstructorOptions={}){

        // Enable default theme
        if (options.default_theme !== false){
            document.body.classList.add('fb-enhancer-theme')
        }

        // Set defaults
        this.client = options.client ?? new FetchClient()
        this._app_origin = options.app_origin ?? 'https://app.fetch.bible'
        this._app_args = new URLSearchParams(options.app_args ?? {}).toString()
        this._history = options.history !== false
        this._translations = options.translations ?? []
        this._always_detect_english = options.always_detect_english !== false
        this._before_history_push = options.before_history_push ?? (() => {})

        // Pre-generate app DOM so it is ready to go once user clicks a reference
        this._app_div = document.createElement('div')
        this._app_div.classList.add('fb-enhancer-app')
        this._app_iframe = document.createElement('iframe')
        this._app_iframe.src =
            `${this._app_origin}#back=true&trans=${this._translations.join(',')}&${this._app_args}`
        this._app_div.appendChild(this._app_iframe)
        document.body.appendChild(this._app_div)
        this._app_div.addEventListener('click', () => {
            this.hide_app()
        })

        // Hide app when the back button (within app) is clicked
        self.addEventListener('message', event => {
            if (event.origin !== this._app_origin){
                return  // Website could get message from any source so ensure it's from fetch app
            }
            if ((event.data as {type:string})['type'] === 'back'){
                this.hide_app()
            }
        })

        // Whenever page changed, hide app (regardless if history option enabled or not)
        self.addEventListener('popstate', event => {
            this._app_div.classList.remove('fb-show')
        })
    }

    // Show app and display given passage
    show_app(passage:PassageReference){

        // Reveal app and navigate it to desired passage
        this._app_div.classList.add('fb-show')
        this._app_iframe.contentWindow?.postMessage({
            type: 'update',
            trans: this._translations.join(','),
            search: passage.book + passage.get_verses_string(),
        }, this._app_origin)

        // Optionally push item to history so browser back hides app rather than changing page
        if (this._history){
            // NOTE fetch_enhancer_app isn't used, just given in case developer wants to identify it
            this._before_history_push()
            window.history.pushState({fetch_enhancer_app: true}, '')
        }
    }

    // Hide app
    hide_app(){
        this._app_div.classList.remove('fb-show')

        // If history enabled and current state is own, go back to non-app-showing state
        const owned = (window.history.state as null|Record<string, unknown>)?.['fetch_enhancer_app']
        if (this._history && !!owned){
            window.history.back()
        }
    }

    // Request and set passage contents of a hover div
    async _set_hover_contents(div:HTMLDivElement, ref:PassageReference){
        const collection = await this.client.fetch_collection()

        // If translation hasn't been set yet, choose sensible default
        if (!this._translations.length){
            this._translations = [collection.bibles.get_preferred_resource().id]
        }

        let html = ''
        for (const trans of this._translations){
            // Confirm translation has book before attempting to get it
            const trans_meta = collection.bibles.get_resource(trans)
            if (!trans_meta){
                continue  // Must have been given invalid trans id
            }
            if (collection.bibles.has_book(trans, ref.book)){
                const book = await collection.bibles.fetch_book(trans, ref.book)
                html += book.get_passage_from_ref(ref, {attribute: false})
            } else {
                html += '<p>&mdash;</p>'
            }
            // Append custom attribution which is just the translation's abbreviation
            html += `<div class='fb-attribution'>${trans_meta.name_abbrev}</div>`
        }
        div.innerHTML = html
    }

    // Enhance an element by showing passage on hover and triggering app display on click
    async enhance_element(element:HTMLElement, ref:PassageReference){

        // Set custom property so can detect if an SPA has serialized the element and lost listeners
        // @ts-ignore Custom property
        element['_fetch_enhanced'] = true

        // Open app when element clicked
        element.addEventListener('click', event => {
            event.preventDefault()  // Important if a link
            void this.show_app(ref)
        })

        // The rest relates to hover box functionality, so skip if a touch device
        if (!this._can_hover){
            return
        }

        // Create hover box div
        const hover_box = document.createElement('div')
        this._hover_divs.push([hover_box, ref])
        hover_box.setAttribute('class',
            'fb-enhancer-hover fetch-bible no-chapters no-headings no-notes no-red-letter')

        // Request passage contents and fill div when ready
        void this._set_hover_contents(hover_box, ref)

        // Helper for removing the hover box from the DOM (fading out)
        let remove_timeout_id:number|undefined
        const rm_hover_box = () => {
            if (remove_timeout_id === undefined){  // Prevent creating multiple timeouts
                hover_box.style.opacity = '0'  // Start fading (via transition)
                remove_timeout_id = self.setTimeout(() => {
                    if (hover_box.parentNode){  // Ensure actually attached when time to rm
                        hover_box.parentNode.removeChild(hover_box)
                    }
                    remove_timeout_id = undefined  // Reset so will timeout again when reattached
                }, 400)  // WARN Update stylesheet transition if changed
            }
        }

        // Helper for cancelling any removal of the hover box
        const preserve_hover_box = () => {
            clearTimeout(remove_timeout_id)
            remove_timeout_id = undefined
            hover_box.style.opacity = '1'
        }

        // Attach the box to DOM when hover over the chosen element
        element.addEventListener('mouseenter', event => {

            // If hovering back over after leaving, just cancel any rm timeout
            if (hover_box.parentNode){
                preserve_hover_box()
            } else {
                // Instantly remove any other hover boxes for any other reference
                for (const body_child of document.body.children){
                    if (body_child.classList.contains('fb-enhancer-hover')){
                        document.body.removeChild(body_child)
                    }
                }
                // Position box under element and to right of cursor
                const rect = element.getBoundingClientRect()
                const hover_width = 350  // WARN Update stylesheet if change
                const max_left = document.documentElement.clientWidth - hover_width - 4
                hover_box.style.top = `${window.scrollY + rect.top + rect.height + 4}px`
                hover_box.style.left = `${Math.min(max_left, event.clientX + 4)}px`

                // Attach and ensure visible
                hover_box.style.opacity = '1'
                document.body.appendChild(hover_box)
            }
        })

        // Begin removal when stop hovering over element
        element.addEventListener('mouseleave', () => {
            rm_hover_box()
        })

        // Preserve box when hovering over the box itself
        hover_box.addEventListener('mouseenter', () => {
            preserve_hover_box()
        })
        hover_box.addEventListener('mouseleave', () => {
            rm_hover_box()
        })

        // Open app when click hover box
        hover_box.addEventListener('click', () => {
            void this.show_app(ref)
        })
    }

    // Auto-discover references in text of page and transform into links
    async discover_bible_references(root:HTMLElement=document.body,
            filter?:(element:Element)=>boolean){

        // Get access to collection and ensure translation specified
        const collection = await this.client.fetch_collection()
        if (!this._translations.length){
            this._translations = [collection.bibles.get_preferred_resource().id]
        }

        // Ensure existing links are active (SPAs might reattach without event listeners)
        for (const link of root.querySelectorAll('.fb-enhancer-link')){
            // @ts-ignore Custom property
            if (link['_fetch_enhanced']){
                continue  // Hasn't been serialized by an SPA so should still have listeners
            }
            // Get ref text from URL as link text may be relative and not include book etc.
            const search = new URLSearchParams((link as HTMLLinkElement).href.split('#')[1])
                .get('search') ?? ''
            const ref = PassageReference.from_string(search)  // No names as just detecting code
            if (ref){
                void this.enhance_element(link as HTMLElement, ref)
            }
        }

        // Load book names for each translation before discovering references
        // NOTE Repeat calls ok since will cache results
        for (const trans of this._translations){
            // NOTE Skip for English to speed up execution since already have English names
            if (!collection.bibles.has_resource(trans) || trans.startsWith('eng_')){
                continue
            }
            await collection.bibles.fetch_translation_extras(trans)
        }

        // Discover and markup references as <a> elements
        const items = await markup_references(
            collection, root, this._translations, this._always_detect_english, filter)
        for (const {element, ref} of items){

            // Add href to each
            element.setAttribute('href', `${this._app_origin}#trans=${this._translations.join(',')}`
                + `&search=${ref.to_serialized()}&${this._app_args}`)
            element.setAttribute('target', '_blank')

            // Enhance the new <a> element
            void this.enhance_element(element, ref)
        }
    }

    // Change translations used for hover boxes and app
    change_translation(...trans:string[]){
        this._translations = trans
        for (const [div, ref] of this._hover_divs){
            void this._set_hover_contents(div, ref)
        }
    }
}
