
import {execFile, execSync} from 'node:child_process'
import {join} from 'node:path'
import {existsSync} from 'node:fs'

import {clean_dir, PKG_PATH} from './utils.js'


// Project-local Python venv and the one-shot worker script that runs inside it
const VENV_DIR = join(PKG_PATH, 'usfmtc-venv')
const PYTHON = join(VENV_DIR, 'bin', 'python')
const WORKER = join(PKG_PATH, 'usfmtc_worker.py')


export function update_usfmtc(version=''){
    // Create a project-local Python venv and install usfmtc into it
    clean_dir(VENV_DIR)
    execSync(`python3 -m venv "${VENV_DIR}"`, {stdio: 'inherit'})
    const spec = version ? `usfmtc==${version}` : 'usfmtc'
    execSync(`"${PYTHON}" -m pip install --upgrade pip ${spec}`, {stdio: 'inherit'})
    // Confirm it imports so a broken install fails loudly here rather than mid-process
    execSync(`"${PYTHON}" -c "import usfmtc"`, {stdio: 'inherit'})
}


export function convert(text:string, informat:'usfm'|'usx', outformat:'usfm'|'usx',
        esids=false):Promise<string>{
    // Convert a single book's text from one format to another via a short-lived usfmtc process
    if (!existsSync(PYTHON)){
        throw new Error(`usfmtc venv missing at ${VENV_DIR} — run 'collector setup-usfmtc'`)
    }
    return new Promise((resolve, reject) => {
        // 256MB buffer is ample for a single book's USX/USFM text
        const proc = execFile(PYTHON, [WORKER, informat, outformat, esids ? '1' : '0'],
            {maxBuffer: 1 << 28, encoding: 'utf8'}, (error, stdout, stderr) => {
                if (error){
                    reject(new Error(stderr.trim() || error.message))
                } else {
                    resolve(stdout)
                }
            })
        // Feed the source text in and signal end-of-input
        proc.stdin!.end(text)
    })
}
