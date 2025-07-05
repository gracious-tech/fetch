
// Export everything intended for direct use (code and types)


// CODE


// Re-export everything from bible-references for convenience
export * from '@gracious.tech/bible-references'
export type * from '@gracious.tech/bible-references'


// Internal code
// NOTE Don't export classes not meant to be initiated directly, export them as types instead
export {FetchClient} from './client.js'
export {substantial_poetry} from './assets/data.js'
export {FetchNetworkError} from './assets/request.js'


// TYPES
// Only expose those relevant to the user and willing to support going forward)

export type * from './assets/types.js'
export type {FetchClientConfig} from './client.js'
export type {RequestHandler} from './assets/request.js'


export type {BookCrossref} from './book/crossref.js'
export type {GlossesBook, GlossesWord} from './book/glosses.js'
export type {NotesBook, RelevantNotes} from './book/notes.js'
export type {
    GetHtmlOptions,
    GetTxtOptions,
    IndividualVerse,
    BibleBook,
    BibleBookHtml,
    BibleBookTxt,
    BibleBookUsfm,
    BibleBookUsx,
} from './book/bible.js'


export type {FetchCollection} from './collection/collection.js'
export type {BibleCollection} from './collection/bibles.js'
export type {
    GetLanguagesOptions,
    GetLanguagesItem,
    GetResourcesOptions,
    GetResourcesItem,
    GetBooksOptions,
    GetBooksItem,
    GetCompletionReturn,
} from './collection/generic.js'


export type {SearchWords, SearchWordsResults} from './other/search.js'


export type {
    BookNames,
    BibleJsonHtml,
    TxtHeading,
    TxtNote,
    TxtContent,
    BibleJsonTxt,
    GlossesData,
    NotesData,
    SearchData,
} from './assets/shared_types.js'
