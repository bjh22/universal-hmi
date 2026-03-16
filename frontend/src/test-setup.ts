import '@testing-library/jest-dom'

// Node v22+ ships a built-in `localStorage` global (a getter on globalThis)
// that is a non-functional stub unless --localstorage-file is set. It shadows
// jsdom's proper Web Storage implementation, breaking tests that call
// localStorage.clear(), .getItem(), etc.
//
// Fix: replace it with a simple in-memory Storage that matches the Web API.
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.clear !== 'function'
) {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    clear() { store.clear() },
    getItem(key: string) { return store.get(key) ?? null },
    setItem(key: string, value: string) { store.set(key, String(value)) },
    removeItem(key: string) { store.delete(key) },
    key(index: number) { return [...store.keys()][index] ?? null },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  })
}
