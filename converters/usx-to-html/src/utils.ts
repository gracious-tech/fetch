

export function escape_text(text:string|null|undefined):string{
    // Escape text for insertion into HTML
    // NOTE Option element is used since it can be inited with plain text
    return new Option(text ?? '').innerHTML
}
