const store = new Map();

export default {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, val) => {
    store.set(key, String(val));
  },
  removeItem: async (key) => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
};
