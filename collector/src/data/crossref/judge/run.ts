
// CLI for the one-time judging campaign (see README.md). Run via node after building:
//   node collector/dist/data/crossref/judge/run.js <status|slices [n] [size]|merge>

import {make_slices, merge_outputs, print_status, SLICE_SIZE} from './campaign.js'


// Dispatch the requested campaign action
const [action, arg1, arg2] = process.argv.slice(2)
if (action === 'status'){
    await print_status()
} else if (action === 'slices'){
    await make_slices(arg1 ? parseInt(arg1, 10) : 5, arg2 ? parseInt(arg2, 10) : SLICE_SIZE)
} else if (action === 'merge'){
    merge_outputs()
} else {
    console.error('usage: run.js <status|slices [n] [size]|merge>')
    process.exitCode = 1
}
