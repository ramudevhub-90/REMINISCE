// Small in-memory TTL cache so repeated kits don't spend Qloo quota.
export function createCache({ ttlMs = 6 * 60 * 60 * 1000, max = 500 } = {}) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= max) store.delete(store.keys().next().value);
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    get size() {
      return store.size;
    },
  };
}
