# Atrium — Devpost draft

Paste the sections below into the Devpost form. Replace the bracketed lines once the public URL and repository exist.

- Demo: [public URL]
- Repository: [public GitHub URL]
- License: MIT (`LICENSE` in the repo root)

## Tagline

A cultural prompt goes in. Qloo's taste graph comes back as a room: light, sound, drink, and objects, each one citing the entity that earned it.

## Inspiration

Agents can describe a mood. They are worse at knowing what that mood sits next to in the culture: which musicians, which bars, which objects. Atrium treats that as a compilation problem. "Blade Runner meets a 1970s jazz bar" should not become a generic cyberpunk palette from a language model's memory. It should become the artists, places, and brands Qloo actually connects to those seeds, then a room built only from that graph.

## What it does

1. You type a prompt, or pick one: Blade Runner meets a 1970s jazz bar, a Wes Anderson brunch, reading Murakami on a rainy night, Studio Ghibli bathhouse at dusk.
2. The orchestrator searches Qloo for the names in the prompt (`GET /search`) and resolves mood words to real tag ids (`GET /v2/tags`). It does not invent tag URNs.
3. It calls `GET /v2/insights` across artists, places, brands, books, movies, and tags, with `signal.interests.entities` and `signal.interests.tags`, and asks for explainability.
4. A deterministic compiler turns that graph into versioned JSON: hex palette, visual mode, generative or entity artwork, a WebAudio texture (tempo, scale, frequencies), and lists of music, drinks, and decor. Zod validates the JSON. The same graph always produces the same room.
5. The browser renders the room and plays the texture after a click. The side panel shows the seeds, the cross-domain rows, the affinity or explainability score, and the exact Qloo calls.
6. Optional: send the palette to a webhook, a Philips Hue group, or a Home Assistant light. This is off unless configured. A Hue bridge is LAN-only, so a public demo should use a webhook.

There is no account and no login.

## Why this needs Qloo

The compiler has no playlist of its own. Music rows are artist entities from insights. Drinks are chosen from the tags on place entities, and when no drink rule matches, the recommendation is the place itself. Palette hues are a weighted blend of the tags and names Qloo returned. If nothing in the graph matches the palette lexicon, the hue is a stable hash of the top entity id, and the panel says so.

Take Qloo out and the room has nothing to cite. A language model could still invent a "Blade Runner jazz bar," and it would look confident. It would not be able to show that Vangelis arrived as an artist affinity from the film while Miles Davis or The Low Room arrived from the jazz tag signal, with the score next to each name. That trace is the product.

The dossier is deliberately plain about failure. Empty artist results become "No artist affinities" instead of a made-up band. Empty places become "No bar affinities." Mock mode, used until `QLOO_API_KEY` is set, is labeled on the room and on every fixture row. Fixture ids are prefixed `mock:` and are not cached Qloo responses.

## How we built it

- Next.js, TypeScript, Tailwind, shadcn/ui.
- Vercel AI SDK tool calling (`search_taste`, `search_tags`, `select_seeds`, `taste_insights`, `compile_atmosphere`) when `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `AI_GATEWAY_API_KEY` is set. The model is not allowed to author the room JSON. The last tool runs the compiler.
- The same client methods run in a fixed order when no model key is present, so the demo works before either key arrives.
- Qloo hackathon host `https://hackathon.api.qloo.com`, header `X-Api-Key`, GET only. Legacy `/recommendations` is not called.
- WebAudio oscillators, filtered noise, and a tempo LFO. Artwork is generated from the palette, or uses an entity image URL when Qloo returns one.
- Tests cover compiler determinism, citation integrity, the fixture pipeline for the four example prompts, the live client's URL and header shape, and the dispatch flag.

## Challenges

Hackathon keys do not work on the production or staging hosts, and a wrong host looks like a bad key. The client says so on a 401. Insights silently ignore parameters that are illegal for a `filter.type`, so the client only sends `signal.interests.entities`, `signal.interests.tags`, `take`, and `feature.explainability`, which the entity-type guide allows for these domains. Tag ids come from `/v2/tags` rather than from strings we made up.

A Philips Hue bridge cannot be reached from a hosted website. The public path is a webhook or a Home Assistant URL that is already on the internet. Local Hue still works when the Next.js server is on the same LAN.

## What's next

- Swap the fixture graph for live responses as soon as the hackathon key arrives, and confirm explainability rows against real payloads. The parser already accepts `query.affinity` and nested explainability objects.
- Tune the compiler's drink and decor lexicons against the tag names the live graph actually returns.
- Add a saved-room link so a judge can reopen a specific compile.

## What the judges need from us

- A public deployment with `QLOO_API_KEY` set and `QLOO_MODE=auto`, so the badge says Live Qloo.
- This repository public, with `LICENSE` visible.
- The demo URL in the Devpost form. No login, no allowlist.
