// Profiles live only on this device. Storage can be unavailable (private
// windows, blocked site data), so every access is guarded.
const KEY = "reminisce.profile.v1";

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* not persisted; the app still works for this visit */
  }
}
