/** Only callbacks live here; no form data or credentials are persisted. */
const guards = new Map<symbol, (action: () => void) => void>();
export function registerUnsavedGuard(key: symbol, guard: (action: () => void) => void) {
 guards.set(key, guard);return () => { guards.delete(key); };
}
export function requestHubTransition(action: () => void) {
 const active=[...guards.values()].at(-1);
 if(active)active(action);else action();
}
export function isActiveUnsavedGuard(key:symbol){return [...guards.keys()].at(-1)===key;}
