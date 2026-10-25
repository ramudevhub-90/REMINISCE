// The narration for the demo video, in three parts:
//   intro  — explainer scenes (index = scene in explainer.html)
//   demo   — the live app, one beat per action
//   outro  — explainer scenes again
// Every line is read aloud and burned in as a caption.

// Amazon Polly (neural or generative) in the project's AWS account, or macOS `say`.
export const VOICE = { engine: "polly", name: "Ruth", polly: "generative" };

export const INTRO = [
  {
    scene: 0,
    text: "This is Reminisce, a companion for people caring for someone with dementia. It uses Qloo’s taste graph to bring back the music, films and food of someone’s youth, and it gets better with every visit.",
  },
  {
    scene: 1,
    text: "More than fifty-five million people live with dementia. Many can no longer tell you what they like. But a song or a taste from their youth can still reach them. For a carer, the hard part is knowing what to try.",
  },
  {
    scene: 2,
    text: "So a carer starts with a few fragments: what they call the person, where they grew up, roughly when, and a handful of things they have always loved. The name stays on the phone. Only the place, the decade and those fragments go to Qloo.",
  },
  {
    scene: 3,
    text: "The agent finds each fragment in Qloo. Kishore Kumar is a singer. Guide, with its year, is a film from 1965. Fish curry is a dish that Qloo tags on restaurants.",
  },
  {
    scene: 4,
    text: "Then Qloo’s taste graph expands those seeds across music, film and food: what did people with the same tastes love back then? The decade sets a release-year window for films, and the agent finds Qloo’s own era genre, Old Hindi, to keep the music in the right years.",
  },
];

// Each beat runs an action in the live app, then holds while its line is read.
export const DEMO = [
  { id: "home", text: "Here is the live app. There is no sign-up. Anyone can try one of three ready-made people. Let’s pick Baba, who grew up in Kolkata in the 1960s." },
  { id: "building", text: "The agent works in the background and streams each step to the phone as it goes." },
  { id: "kit", text: "Moments later, there is a session kit for Baba." },
  { id: "music", text: "Classic singers of his era, each with a photo and a way to play them." },
  { id: "films", text: "Films from the years he grew up in, and fish curry to cook together, with places nearby that are known for it." },
  { id: "why", text: "Every suggestion has a Why this panel. It shows the Qloo affinity behind it, and it always describes people with similar tastes, never a claim about Baba himself." },
  { id: "session", text: "During the visit, session mode shows one big card at a time. The carer plays the song, watches, and taps one word." },
  { id: "react", text: "Here, Baba lit up." },
  { id: "summary", text: "At the end, the carer adds a short note to the journal. It stays on this device." },
  { id: "learning", text: "Now Reminisce knows what reached him." },
  { id: "next", text: "Plan the next session. What lit him up goes back to Qloo as new signals, and anything marked not today is set aside." },
  { id: "week2", text: "So week two opens with his favourites to play again, then brings new films and songs, shaped by what actually worked." },
];

export const OUTRO = [
  {
    scene: 8,
    text: "That is the loop. Each session teaches the next one, building a taste profile for someone who can no longer describe their own.",
  },
  {
    scene: 9,
    text: "Under the hood, it is serverless on AWS. The phone starts a job through AppSync, a queue hands it to the agent, and the agent calls Qloo through the official harness, with every result cached. Progress streams back step by step, and the Qloo key never leaves the server.",
  },
  {
    scene: 10,
    text: "And it needs Qloo. Only a taste graph connects a singer to films and food, and turns a smile into a signal. Next, carers will debrief by voice, see a timeline of the years they grew up in, and share the profile with family.",
  },
  {
    scene: 11,
    text: "Try it now at the link on screen. Pick Baba, Margaret or Abuela Rosa, and begin a session. Thank you for watching.",
  },
];
