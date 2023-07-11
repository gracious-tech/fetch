import { parseString } from "xml2js"
import { writeFileSync } from 'fs'

interface IJsonFormat {
    chapters: {
        [chapterId: string]: string[]
    }
    headers: {
        chapter: number
        verse: number
        text: string
    }[]
}

interface ICurrentIndex {
    chapter: number
    verse: number
    text: string
    header: string | undefined
}

interface IRow {
    _: string
    verse?: { $: { sid?: string; eid?: string; } }[]
    $: {
        style: string;
    }
}

function resetIndex(chapter: number, verse: number, text?: string, header?: string): ICurrentIndex {
    return {
        chapter,
        verse,
        text: text ?? "",
        header
    };
}

export function convert_to_json(xmlString: string, filePath: string): void {
    const trimmed = removeXmlElements(xmlString, ['char'])
    parseString(trimmed, function (err, result) {
        if (err) {
            console.log(`err ${filePath}`,  err);
        }
        const paragraphs = result.usx.para;

        const bookContext: { data: IJsonFormat; currentIndex: ICurrentIndex } = paragraphs.reduce((acc: { data: IJsonFormat; currentIndex: ICurrentIndex }, next: IRow): { data: IJsonFormat; currentIndex: ICurrentIndex } => {
            // if is a row with a verse tag, first or last in the verse
            if (next.verse) {
                const nextIndex = getVerseIndex(next.verse, acc.currentIndex)
                return handleVerseRow(acc, nextIndex, next)
            }
                
            // if is a header
            if (next.$.style === 's1') {
                acc.currentIndex.header = getTextString(next);
                return acc;
            }

            // if is another line within the same verse
            const verseStyles = ["li1"];
            if (verseStyles.includes(next.$.style)) {
                acc.currentIndex.text = `${acc.currentIndex.text}\n${getTextString(next)}`
                return acc;
            }

            // if is a line break
            if (next.$.style === 'b') {
                // if there is a header
                if (acc.currentIndex.header !== undefined) {
                    acc.currentIndex.header = `${acc.currentIndex.header}\n`;
                } else {
                    // if there is no header
                    acc.currentIndex.text = `${acc.currentIndex.text}\n`;
                }

            }
                
            // ignore the line, contains non verse elements
            return acc
        }, {
                data: {
                    chapters: {},
                    headers: []
                },
                currentIndex: resetIndex(0, 0)
        });

        // process the last line
        const bookJson = writeVerse(bookContext)

        writeFileSync(filePath, JSON.stringify(bookJson.data))
    });
}

function getVerseIndex(verseTags: { $: { sid?: string; eid?: string; } }[], currentIndex: ICurrentIndex): { chapter: number; verse: number; } {
    const verse = verseTags.find(element => !!element.$.sid || !!element.$.eid)
    if (!verse) {
        return {
            chapter: currentIndex.chapter,
            verse: currentIndex.verse
        }
    }

    const verseId = verse.$.sid ?? verse.$.eid
    const index = verseId?.split(" ")[1]?.split(":");
    return {
        chapter: Number(index?.[0]),
        verse: Number(index?.[1])
    }
}

function getTextString(row: IRow): string {
    return row._
}

// this is needed because of the way chars are handled
const removeXmlElements = (hay: string, elements: string[]) =>{
    let ret = hay    
    
    for (const item of elements) { 
        const regexp1 = new RegExp(`<${item}>`, "gs");
        ret = ret.replace(regexp1, "")
        const regexp2 = new RegExp(`<${item} [^<>].*?>`, "gs");
        ret = ret.replace(regexp2, "")
        const regexp3 = new RegExp(`</${item}>`, "gs");
        ret = ret.replace(regexp3, "")
    }

    return ret
}

function addElementsToArray<T>(arr: T[], endIndex: number, element: T): T[] {
    if (endIndex <= arr.length) {
      return arr; // Return the current array if the index is equal to or lower than the array length
    }
  
    const newArray = [...arr]; // Create a shallow copy of the original array
  
    for (let i = arr.length; i < endIndex; i++) {
      newArray[i] = element; // Fill the new array with the given element
    }
  
    return newArray;
}

function writeVerse(currentState: { data: IJsonFormat; currentIndex: ICurrentIndex }): { data: IJsonFormat; currentIndex: ICurrentIndex } {
    // verse has changed
    const currentVerses = (currentState.data.chapters[currentState.currentIndex.chapter] ?? []);

    // if verse is > than expected, fill with empty strings
    const verses = addElementsToArray(currentVerses, currentState.currentIndex.verse - 1, "").concat(currentState.currentIndex.text)

    currentState.data.chapters = {
        ...currentState.data.chapters,
        [currentState.currentIndex.chapter]: verses
    }

    return currentState;
}

function handleVerseRow(currentState: { data: IJsonFormat; currentIndex: ICurrentIndex }, nextIndex: { chapter: number; verse: number; }, row: IRow): { data: IJsonFormat; currentIndex: ICurrentIndex } {
    // ignore the initial state
    if (currentState.currentIndex.chapter !== 0) {
        // still the same verse
        if (nextIndex.chapter === currentState.currentIndex.chapter && nextIndex.verse === currentState.currentIndex.verse) {
            currentState.currentIndex.text = `${currentState.currentIndex.text}\n${getTextString(row)}`
            return currentState
        }
        
        currentState = writeVerse(currentState)
    }

    // if there is a header, belongs to the new verse
    if (currentState.currentIndex.header) {
        currentState.data.headers.push({
            chapter: nextIndex.chapter,
            verse: nextIndex.verse,
            text: currentState.currentIndex.header
        })
    }
    
    // keep the current verse as the context until we reach the next one
    currentState.currentIndex = resetIndex(nextIndex.chapter, nextIndex.verse, getTextString(row))
    return currentState
}
