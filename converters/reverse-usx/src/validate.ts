
export function validate_numbering(doc:XMLDocument){
    // Ensure all chapter and verse markers are sequential

    let next_element:'chapter'|'verse' = 'chapter'
    let next_pos:'sid'|'eid' = 'sid'
    let next_ch_num = 1
    let next_v_num = 1

    for (const element of doc.querySelectorAll('chapter, verse')){

        // Util for easier debugging
        const expected = (expect:string) => {
            const boundary = `Expected ${expect} but got ${element.outerHTML}`
            console.error(boundary)
            const block = element.nodeName === 'chapter' ? element : element.parentNode as Element
            const doc_elements = [...block.parentElement!.children]
            const root_i = doc_elements.findIndex(n => n === block)
            const out_nodes = doc_elements.slice(Math.max(0, root_i - 3), root_i + 1)
            // NOTE rm <char>s as they make it really hard to read when every word has strongs
            console.debug(out_nodes.map(e => e?.outerHTML ?? '').join('\n\n')
                .replace(/<\/?char.*?>/g, ''))
            throw new Error(boundary)
        }

        // If expecting a verse sid, a chapter eid is also possible, so switch if chapter detected
        if (next_element === 'verse' && next_pos === 'sid' && element.nodeName === 'chapter'){
            next_element = 'chapter'
            next_pos = 'eid'
        }

        // Confirm expected element type
        if (element.nodeName !== next_element){
            expected(`${next_element}`)
        }

        // Confirm expected position (sid or eid)
        const pos =
            element.hasAttribute('sid') ? 'sid' : (element.hasAttribute('eid') ? 'eid' : null)
        if (pos !== next_pos){
            expected(`${next_pos}`)
        }

        // Confirm expected chapter number
        const [ch_num, v_num] = element.getAttribute(pos!)!.slice(3).split(':')
            .map(n => parseInt(n)) as [number, number|undefined]
        if (ch_num !== next_ch_num){
            expected(`chapter ${next_ch_num}`)
        }

        // Confirm expected verse number (if a verse)
        // NOTE Verse numbers are allowed to skip forward as long as still sequential
        // NOTE A repeat of the previous number is allowed for verse segments (35a, 35b, etc)
        if (element.nodeName === 'verse' && v_num! < next_v_num - 1){
            expected(`verse ${next_v_num}`)
        }

        // Ensure number attribute is same as id
        if (element.hasAttribute('number')){
            const number = parseInt(element.getAttribute('number')!)
            const number_expected = element.nodeName === 'chapter' ? ch_num : v_num
            if (number !== number_expected){
                expected(`number attr to be ${number_expected!}`)
            }
        }

        // Determine what's next
        if (next_element === 'chapter' && next_pos === 'sid'){
            next_element = 'verse'
            next_pos = 'sid'
            next_v_num = 1
        } else if (next_element === 'chapter' && next_pos === 'eid'){
            next_pos = 'sid'
            next_ch_num += 1
            next_v_num = 1
        } else if (next_element === 'verse' && next_pos === 'sid'){
            next_pos = 'eid'
        } else {  // verse with eid
            next_pos = 'sid'
            // Advance to just past this verse's own number, so segments of one verse
            // (35, 35a, 35b all parse to 35) don't each inflate the counter
            next_v_num = Math.max(next_v_num, v_num! + 1)
        }
    }
}
