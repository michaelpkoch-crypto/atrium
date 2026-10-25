# Atrium — Devpost draft

The working demo is the Vercel deployment. Production and Preview both have `QLOO_API_KEY` and `OPENAI_API_KEY`. The repository stays private. Put the public deployment URL on the form. There is no login.

- Demo: the Vercel production URL for this project
- Repository: private
- License: MIT (`LICENSE` in the repo root)

## Tagline

A cultural prompt becomes a room. Qloo decides the lamps, the counter, and the sound. The plain model, given the same sentence and no taste graph, does not.

## The problem

A language model can describe "Blade Runner meets a 1970s jazz bar." It reaches for cyan rain and a saxophone. It does not know which artists, which bar, or which tags actually sit next to that taste, or how strongly. Atrium is for someone setting a room at home, and for a bar, a restaurant, or a retail floor that wants the same thing: an ambiance that comes from a taste graph, with a virtual room to judge it in and a bridge to real lights.

## What it does

1. You type a prompt, or pick one: Blade Runner meets a 1970s jazz bar, a Wes Anderson brunch, reading Murakami on a rainy night, Studio Ghibli bathhouse at dusk.
2. `gpt-4.1-mini` chooses the Qloo lookups. It searches names (`GET /search`), resolves mood words to real tag ids (`GET /v2/tags`), selects seeds, then calls `GET /v2/insights` for artists, places, brands, books, movies, and tags. It does not invent tag URNs and it does not write the room JSON.
3. A deterministic compiler turns that graph into the room. Each lamp, object, and sound layer cites the entity and, when there is one, the tag and affinity. The poster is drawn type. The bed is a pad, a texture, and a pulse, inspired by the artists Qloo returned. Nothing in the audio is a copyrighted recording.
4. A second call to the same model, with no tools, draws the cliché of the prompt. On a phone you toggle or swipe between the rooms. On a wide screen they sit side by side. The card under them names what Qloo added.
5. **Send to my real lights** can post the palette to a webhook, a Philips Hue group, or a Home Assistant light. That path is off unless configured. A public demo should use a webhook or a public Home Assistant URL. Hue is LAN-only.

There is no account.

## Why this needs Qloo

Take Qloo out and both rooms are the plain model. The product is the gap: Joe Hisaishi and a bathhouse counter instead of "a solo piano and a cute spirit"; Vangelis and a named bar instead of "an unnamed synth composer." The trace shows the calls. The chip on a lamp shows the tag, the affinity, and the entity. If the submission worked the same without Qloo, it would be the wrong thing. The comparison is there so a judge can see that it does not.

## How Qloo is used

Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`, server-side only. The client does not call `/recommendations` or `/recs`.

1. `GET /search` resolves names to entity ids.
2. `GET /v2/tags` resolves mood words to tag ids.
3. `GET /v2/insights` runs per domain with `signal.interests.entities`, `signal.interests.tags`, and `feature.explainability=true`.

Invalid parameters are omitted rather than sent. Insights rows describe what groups tend to like. The prompt is a cultural description. Personal data is not sent.

### Redacted walkthrough

The shapes below are the labeled fixture in `lib/qloo/fixtures.ts`, used when no key is present. Live payloads are not committed. The hosted app runs the same calls against the hackathon API.

Prompt: `Studio Ghibli bathhouse at dusk`.

- Search resolves the film as a seed.
- Tag search resolves words such as dusk and bathhouse to tag ids.
- Artist insights return a score such as Joe Hisaishi. Place insights return a counter such as Bathhouse Tea Counter. Movie, brand, and book insights fill the poster and the shelf.
- The compiler picks the bath plan and a dusk window from those setting tags, not from a keyword scan of the sentence. Lanterns cite tags such as Anime and Bathhouse. Steam in the bed cites the bath tag. The tempo cites the artist row.
- The plain model, with no tools, writes a bright daylight room: cel green, a solo piano, a spirit. The diff lists Joe Hisaishi, the tea counter, and the film.

A second example, `Blade Runner meets a 1970s jazz bar`, is a neon room. One lamp cites a neon tag. Another cites a jazz tag, so a warm lamp sits in the cyan room. The plain side stays on cyan rain and a saxophone with no name.

## How we built it

- Next.js, TypeScript, Tailwind, shadcn/ui, on Vercel.
- Vercel AI SDK tool calling: `search_taste`, `search_tags`, `select_seeds`, `taste_insights`, `compile_atmosphere`. The last tool runs the compiler. The plain comparison is `generateText` with `Output.object` and no tools. Default model `gpt-4.1-mini`.
- With no model key the same Qloo client runs in a fixed order, and the plain side is a labeled cliché. That path is for local development. The hosted app has the key.
- With no Qloo key the page uses the fixture graph and the badge says Mock fixture.
- WebAudio: detuned pad, a texture buffer, and a tempo pulse. Artwork is a vector room, not an entity photo.
- Tests cover compiler output, citation integrity, the four example prompts, the comparison, the client URL and header, and the dispatch flag.

## Challenges

Hackathon keys do not work on the production or staging hosts. A 401 from the client names `hackathon.api.qloo.com`. Insights silently ignore parameters that are illegal for a `filter.type`, so the client only sends the parameters the entity-type guide allows.

A Philips Hue bridge cannot be reached from a hosted website. The public path is a webhook or a Home Assistant URL that is already on the internet.

The agent and the plain model run together, so `/api/compile` asks for 60 seconds. A plan may cap that lower. The route allows 30 compiles per 10 minutes per IP so a judge can try the examples.

## Known limitations

- Color, tempo, and texture start from a table of tag-name stems. Unknown tags still become lamps, hashed from the tag id, and the provenance says there was no prior.
- The plain room is live only when a provider key is set. It is set on Production and Preview.
- Audio is synthesized. It names the Qloo artists it is inspired by. It does not play their recordings.
- The compiler does not use entity photos.
- Mock mode is labeled. Fixture ids are prefixed `mock:`.
- The rate limit is in memory, per server instance.
- Do not send personal data.

## What's next

- Point a public webhook at a real floor so "send to my real lights" changes a room a judge can stand in.
- Save a room link so a compile can be reopened.
- Let a venue pin a few house entities so the graph starts from the bar's own taste, not only from the prompt.
