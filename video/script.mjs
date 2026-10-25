// The narration for the demo video, in three parts:
//   intro  — explainer scenes (index = scene in explainer.html)
//   demo   — the live app, one beat per action
//   outro  — explainer scenes again
// Every line is read aloud and burned in as a caption.

// Amazon Polly (neural or generative) in the project's AWS account, or macOS `say`.
export const VOICE = { engine: "polly", name: "Kajal", polly: "neural" };

export const INTRO = [
  {
    scene: 0,
    text: "This is Reminisce, a companion for people caring for someone with dementia, at home or in a care home. It uses Qloo’s taste graph to bring back the music, films and food of someone’s youth, and it gets better with every visit.",
  },
  {
    scene: 1,
    text: "More than fifty-five million people live with dementia. Many can no longer tell you what they like. But a song or a taste from their youth can still reach them. For a carer, the hard part is knowing what to try.",
  },
  {
    scene: 2,
    text: "So a carer starts with a few fragments: what they call the person, where they grew up, roughly when, and a handful of things they have always loved. The name stays in their browser. Only the place, the decade and those fragments go to Qloo.",
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
  { id: "home", text: "Here is the live web app. It runs in any browser, on a phone, tablet or laptop, with no install and no sign-up. Anyone can try one of three ready-made people. Let’s pick Baba, who grew up in Kolkata in the 1960s." },
  { id: "building", text: "The agent works in the background and streams each step to the screen as it goes." },
  { id: "kit", text: "Moments later, there is a session kit for Baba." },
  { id: "music", text: "Classic singers of his era, each with a photo and a way to play them." },
  { id: "films", text: "Films from the years he grew up in, and fish curry to cook together, with places nearby that are known for it." },
  { id: "why", text: "Every suggestion has a Why this panel. It shows the Qloo affinity behind it, and it always describes people with similar tastes, never a claim about Baba himself." },
  { id: "session", text: "During the visit, session mode shows one big card at a time. The carer plays the song, watches, and taps one word." },
  { id: "react", text: "Here, Baba lit up." },
  { id: "summary", text: "At the end, the carer adds a short note to the journal. It stays on this device." },
  { id: "learning", text: "Now Reminisce knows what reached him. It even builds a taste portrait from Qloo’s tags on what lit him up, and the next kit leans that way." },
  { id: "next", text: "Plan the next session. What lit him up goes back to Qloo as new signals, and anything marked not today is set aside." },
  { id: "week2", text: "So week two opens with his favourites to play again, then brings new films and songs, shaped by what actually worked." },
  { id: "timeline", text: "From any kit, Their world opens a timeline of the years he grew up in, five years at a time." },
  { id: "years", text: "Each window holds the films of those years that suit his tastes, with a gentle question to ask about them." },
  { id: "group", text: "Care homes can run group sessions too. Add the residents joining today, or try our Sunrise Care Home." },
  { id: "groupKit", text: "Reminisce expands each resident’s tastes through Qloo, then ranks what reaches the most of them. Here, Lata Mangeshkar and Kishore Kumar reach everyone in the room." },
];

export const OUTRO = [
  {
    scene: 8,
    text: "That is the loop. Each session teaches the next one, building a taste profile for someone who can no longer describe their own.",
  },
  {
    scene: 9,
    text: "Under the hood, it is serverless on AWS. The web app starts a job through AppSync, a queue hands it to the agent, and the agent calls Qloo through the official harness, with every result cached. Progress streams back step by step, and the Qloo key never leaves the server.",
  },
  {
    scene: 10,
    text: "And it needs Qloo. Only a taste graph connects a singer to films and food, finds what a whole room shares, and turns a smile into a signal. Next, carers will debrief by voice, and families will share one profile.",
  },
  {
    scene: 11,
    text: "Try it now at the link on screen. Pick Baba, Margaret or Abuela Rosa, or plan a group session at Sunrise Care Home. Thank you for watching.",
  },
];
