// Quick ways to actually play a suggestion during a session.
export function playLink(item) {
  if (item.spotifyId) return { href: `https://open.spotify.com/artist/${item.spotifyId}`, label: "Play on Spotify" };
  if (item.type?.endsWith("artist")) {
    return { href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.name} songs`)}`, label: "Find songs on YouTube" };
  }
  if (item.type?.endsWith("movie")) {
    const q = encodeURIComponent(`${item.name} ${item.year ?? ""} song`);
    return { href: `https://www.youtube.com/results?search_query=${q}`, label: "Watch a clip" };
  }
  if (item.type === "food") {
    return { href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.name} recipe`)}`, label: "Watch a recipe" };
  }
  if (item.type?.endsWith("place")) {
    return { href: `https://www.google.com/maps/search/${encodeURIComponent(item.name)}`, label: "See on a map" };
  }
  return null;
}
