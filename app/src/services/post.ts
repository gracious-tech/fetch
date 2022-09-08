
import {state} from '@/services/state'


export function post_message(type:'ready'|'back'|'button1'|'verse_change'){
    // Send a message to a parent frame
    // NOTE Includes status properties with every message for convenience
    self.parent.postMessage({
        type,
        language: state.trans[0].split('_')[0],
        translation: state.trans[0],
        book: state.book,
        chapter: state.chapter,
    }, '*')  // SECURITY Any origin is allowed to embed fetch(bible) so '*'
}
