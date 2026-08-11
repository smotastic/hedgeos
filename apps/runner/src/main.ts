/** Automation runner composition root. Transition processing is added by the next slice. */
export function createRunner() { return { name: 'runner' as const }; }
