
// WARN Importing this overrides console methods globally (only safe for CLI use)

import colors from 'ansi-colors'


const console_info = console.info
console.info = (msg:string) => console_info(colors.blue(msg))
const console_warn = console.warn
console.warn = (msg:string) => console_warn(colors.yellow(msg))
const console_error = console.error
console.error = (msg:string) => console_error(colors.red(msg))
