// Everything about the person lives only on this device. Storage can be
// unavailable (private windows, blocked site data), so every access is guarded.
const KEYS = { profile: "reminisce.profile.v1", kit: "reminisce.kit.v1", journal: "reminisce.journal.v1" };

function load(name, fallback) {
  try {
    return JSON.parse(localStorage.getItem(KEYS[name])) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(name, value) {
  try {
    localStorage.setItem(KEYS[name], JSON.stringify(value));
  } catch {
    /* not persisted; the app still works for this visit */
  }
}

export const loadProfile = () => load("profile", null);
export const saveProfile = (p) => save("profile", p);
export const loadKit = () => load("kit", null);
export const saveKit = (k) => save("kit", k);
export const loadJournal = () => load("journal", []);
export const saveJournal = (j) => save("journal", j);
