
export function population_text(pop:number|null){
    const mil = Math.round((pop ?? 0) / 1000000)
    return mil ? `${mil.toLocaleString()} million` : "< 1 million"
}
