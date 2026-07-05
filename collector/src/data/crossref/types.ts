
// Stage-A master-list types (collector-internal)

// A passage span: book, start_chapter, start_verse, end_chapter, end_verse
export type Span = [string, number, number, number, number]

// One cross-reference link: the two passages, stored in canonical order (earlier first)
export type MasterLink = [Span, Span]

// A category's full set of links, one direction each, deduplicated
export type MasterList = MasterLink[]


// Stage-B published types for dist/crossref/{category}/{book}.json
// NOTE Kept collector-only for now so shared_types (symlinked into the client) is untouched;
//      move these to shared_types when the client adopts the category format. The client
//      currently still reads the legacy small/medium/large dirs via the old shared types.
// NOTE Compact variable-length tuples to minimise size: the source book is implied by the file,
//      single verses omit the end pair, and targets in the file's own book omit the book id.
//      A target whose first element is a string carries an explicit book; length 2/3 = single
//      verse, 4/5 = a range. Direction (which passage is the earlier original) is not stored —
//      it is derived from canonical book/verse order.

// Source span (book = the file): single [ch, v] or range [ch, v, end_ch, end_v]
export type CrossrefSource = [number, number] | [number, number, number, number]

// Target span: same book → [ch, v] / [ch, v, end_ch, end_v]; other book → prefixed with book id
export type CrossrefTarget = [number, number] | [number, number, number, number]
    | [string, number, number] | [string, number, number, number, number]

// One cross-reference
export type CrossrefEntry = [CrossrefSource, CrossrefTarget]

// All cross-references for a book, keyed by source start chapter
export type CrossrefCategoryData = Record<string, CrossrefEntry[]>

// The cross-reference categories, each published as its own dir under dist/crossref/
export type CrossrefCategory = 'quotation'|'allusion'|'parallel'|'mention'|'relevant'
