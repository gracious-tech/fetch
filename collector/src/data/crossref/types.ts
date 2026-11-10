
// Stage-A master-list types (collector-internal)
// NOTE The Stage-B published types (CrossrefCategory, CrossrefEntry, etc.) live in shared_types
//      since the client reads the published files too

// A passage span: book, start_chapter, start_verse, end_chapter, end_verse
export type Span = [string, number, number, number, number]

// One cross-reference link: the two passages, stored in canonical order (earlier first)
export type MasterLink = [Span, Span]

// A category's full set of links, one direction each, deduplicated
export type MasterList = MasterLink[]
