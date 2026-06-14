#!/usr/bin/env python3

# One-shot usfmtc conversion. Reads a single book's text from stdin and writes the converted text
# to stdout. Arguments: <informat> <outformat> <esids 0|1>. On failure it exits non-zero with the
# error (traceback) on stderr. The collector spawns one of these per book — see
# collector/src/parts/usfmtc.ts.

import io
import sys

import usfmtc


# Parse source text into a usfmtc USX document
def read(text, informat):
    src = io.StringIO(text)
    grammar = usfmtc.usfmGrammar(None)
    if informat == 'usfm':
        return usfmtc.USX.fromUsfm(src, grammar=grammar, strict=False)
    if informat == 'usx':
        return usfmtc.USX.fromUsx(src, grammar=grammar)
    if informat == 'usj':
        return usfmtc.USX.fromUsj(src, grammar=grammar)
    raise ValueError(f'unknown informat: {informat}')


# Serialise a usfmtc USX document to the requested output format as a string
def write(doc, outformat, esids):
    if doc is None:
        raise ValueError('source failed to parse (returned no document)')
    if outformat == 'usx':
        if esids:
            doc.addesids()
        return doc.outUsx()
    if outformat == 'usfm':
        return doc.outUsfm()
    if outformat == 'usj':
        return doc.outUsj()
    raise ValueError(f'unknown outformat: {outformat}')


# Convert stdin to stdout per the formats given on the command line
def main():
    informat, outformat, esids = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
    doc = read(sys.stdin.read(), informat)
    sys.stdout.write(write(doc, outformat, esids))


if __name__ == '__main__':
    main()
