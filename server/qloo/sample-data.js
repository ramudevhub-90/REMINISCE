// Sample data shaped like Qloo Insights API responses. Used until the event
// key arrives (QLOO_MODE=sample). IDs are placeholders, not real Qloo IDs.

const e = (id, name, type, affinity, tags = [], properties = {}) => ({
  entity_id: `sample-${id}`,
  name,
  type: `urn:entity:${type}`,
  popularity: Math.round((0.7 + affinity / 4) * 1000) / 1000,
  query: { affinity },
  tags: tags.map((t) => ({ id: `urn:tag:sample:${t.toLowerCase().replace(/\W+/g, "_")}`, name: t })),
  properties,
});

// Entities a carer is likely to type as seeds.
export const SEED_ENTITIES = [
  e("kishore-kumar", "Kishore Kumar", "artist", 1, ["Bollywood", "Playback singer", "Hindi film music"]),
  e("guide-1965", "Guide", "movie", 1, ["Drama", "Hindi cinema", "Romance"], { release_year: 1965 }),
  e("pather-panchali", "Pather Panchali", "movie", 1, ["Bengali cinema", "Drama"], { release_year: 1955 }),
  e("lata", "Lata Mangeshkar", "artist", 1, ["Bollywood", "Playback singer"]),
  e("the-beatles", "The Beatles", "artist", 1, ["British invasion", "Rock"]),
  e("sound-of-music", "The Sound of Music", "movie", 1, ["Musical", "Family"], { release_year: 1965 }),
];

// Results keyed by target entity type. Ordered by affinity.
export const INSIGHTS = {
  artist: [
    e("rafi", "Mohammed Rafi", "artist", 0.97, ["Bollywood", "Playback singer", "Hindi film music"]),
    e("rd-burman", "R.D. Burman", "artist", 0.95, ["Bollywood", "Film score", "Hindi film music"]),
    e("lata", "Lata Mangeshkar", "artist", 0.94, ["Bollywood", "Playback singer"]),
    e("sd-burman", "S.D. Burman", "artist", 0.92, ["Bollywood", "Film score", "Bengali folk"]),
    e("hemant", "Hemanta Mukherjee", "artist", 0.9, ["Rabindra Sangeet", "Bengali music", "Playback singer"]),
    e("manna-dey", "Manna Dey", "artist", 0.88, ["Playback singer", "Bengali music"]),
    e("asha", "Asha Bhosle", "artist", 0.86, ["Bollywood", "Playback singer"]),
    e("mukesh", "Mukesh", "artist", 0.83, ["Bollywood", "Playback singer"]),
  ],
  movie: [
    e("jewel-thief", "Jewel Thief", "movie", 0.96, ["Thriller", "Hindi cinema"], { release_year: 1967 }),
    e("chalti-ka-naam", "Chalti Ka Naam Gaadi", "movie", 0.95, ["Comedy", "Hindi cinema"], { release_year: 1958 }),
    e("pyaasa", "Pyaasa", "movie", 0.93, ["Drama", "Hindi cinema", "Poetry"], { release_year: 1957 }),
    e("aradhana", "Aradhana", "movie", 0.91, ["Romance", "Hindi cinema"], { release_year: 1969 }),
    e("teesri-manzil", "Teesri Manzil", "movie", 0.89, ["Thriller", "Musical"], { release_year: 1966 }),
    e("charulata", "Charulata", "movie", 0.86, ["Bengali cinema", "Drama"], { release_year: 1964 }),
    e("padosan", "Padosan", "movie", 0.84, ["Comedy", "Musical"], { release_year: 1968 }),
  ],
  place: [
    e("bhojohori", "Bhojohori Manna", "place", 0.94, ["Bengali", "Home-style", "Fish curry"], { address: "Kolkata, West Bengal" }),
    e("kasturi", "Kasturi", "place", 0.92, ["Bengali", "Seafood", "Bangladeshi"], { address: "Kolkata, West Bengal" }),
    e("6-ballygunge", "6 Ballygunge Place", "place", 0.9, ["Bengali", "Heritage", "Fine dining"], { address: "Kolkata, West Bengal" }),
    e("flurys", "Flurys", "place", 0.85, ["Tea room", "Bakery", "Heritage"], { address: "Park Street, Kolkata" }),
    e("indian-coffee-house", "Indian Coffee House", "place", 0.83, ["Café", "Heritage", "Adda"], { address: "College Street, Kolkata" }),
  ],
  book: [
    e("feluda", "Feluda stories", "book", 0.9, ["Detective", "Bengali literature"]),
    e("gitanjali", "Gitanjali", "book", 0.87, ["Poetry", "Rabindranath Tagore"]),
  ],
};

// Tags returned by tag search, e.g. to turn "fish curry" into a cuisine tag.
export const TAGS = [
  { id: "urn:tag:genre:place:restaurant:bengali", name: "Bengali", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:restaurant:seafood", name: "Seafood", type: "urn:tag:genre:place" },
  { id: "urn:tag:keyword:place:fish_curry", name: "Fish curry", type: "urn:tag:keyword:place" },
  { id: "urn:tag:genre:media:hindi_cinema", name: "Hindi cinema", type: "urn:tag:genre:media" },
];
