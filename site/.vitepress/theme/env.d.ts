
import type {BibleEnhancer} from '@gracious.tech/fetch-enhancer'


// Enhancer instance exposed by CustomLayout for use in /access/enhancer/
declare global {
    interface Window {
        fetch_enhancer?:BibleEnhancer
    }
}
