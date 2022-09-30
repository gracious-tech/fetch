
import {state, langs} from '@/services/state'


export function post_message(type:'ready'|'verse'|'back'|'button1'|'dark'){
    // Send a message to a parent frame
    // NOTE Includes status properties with every message for convenience
    self.parent.postMessage({
        type,
        language: langs.value[0],
        translation: state.trans[0],
        book: state.book,
        chapter: state.chapter,
        verse: state.verse,
        dark: state.dark,
    }, '*')  // SECURITY Any origin is allowed to embed fetch(bible) so '*'
}
