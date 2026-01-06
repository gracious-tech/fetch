// Utilities for working with HTML

import type {PassageReference} from '@gracious.tech/bible-references'


// Wrap all parts of verses in <span>s with ids so they can be styled and interacted with
export function wrap_verse_parts(root:HTMLElement):void{

    // Keep track of which verse contents belongs to
    let current_verse_id = ''

    // Process each paragraph
    root.querySelectorAll('p').forEach(p => {

        // Reference for current wrapper <span>
        let wrapper:HTMLSpanElement|null = null

        // Process each direct child of paragraph
        Array.from(p.childNodes).forEach(child => {

            // If encounter a verse marker, update id and end the wrapper span (if any)
            if (child.nodeType === child.ELEMENT_NODE && child.nodeName === 'SUP'
                    && (child as Element).hasAttribute('data-v')){
                current_verse_id = (child as Element).getAttribute('data-v')!
                wrapper = null
                return
            }

            // Add children to the wrapper span
            if (current_verse_id){  // Just in case any text before first verse marker

                // If just started a new verse, will need a new wrapper span
                if (!wrapper){
                    wrapper = root.ownerDocument.createElement('span')
                    wrapper.setAttribute('data-v', current_verse_id)
                    p.insertBefore(wrapper, child)
                }

                // Add the child to the current wrapper
                wrapper.appendChild(child)
            }
        })
    })
}


// Add class to range of verses
// NOTE This doesn't verify the book, it assumes container's verses belong to passage's book
export function add_passage_class(container:HTMLElement, passage:PassageReference, clas:string){
    let begun = false
    for (const span of container.querySelectorAll<HTMLSpanElement>('span[data-v]')){
        const data_v_ints = span.dataset['v']!.split(':').map(part => parseInt(part))
        if (passage.includes(data_v_ints[0]!, data_v_ints[1]!)){
            span.classList.add(clas)
            begun = true
        } else if (begun){
            break  // Have reached passage end
        }
    }
}


// Remove class from verses (that was previously added with `add_passage_class`)
export function rm_passage_class(container:HTMLElement, clas:string){
    for (const element of container.querySelectorAll('.' + clas)){
        element.classList.remove(clas)
    }
}
