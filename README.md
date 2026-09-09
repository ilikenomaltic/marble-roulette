# Marble Roulette

Based on [lazygyu/roulette](https://github.com/lazygyu/roulette) (MIT License, © 2023 LazyGyu).

Live: https://ilikenomaltic.github.io/marble-roulette/

## Added Features

- **Group assignment mode** (2/3/4 per group) based on marble arrival order
- **Teacher settings panel** — type `teacher` on the keyboard to open it
  - **Conflict pairs**: names that must not end up in the same group
  - **Together pairs**: names that must end up in the same group
- **Auto-fill names** (1번~N번)

## How the group constraints work

The race is never manipulated. The physics depends only on the seed and the
spawn slot — a marble's name is just a label drawn on top of it, and which name
gets which slot was already random.

So before the race starts, an anonymous copy of it runs headlessly (~100ms) to
learn which spawn slots finish in which group. Names are then assigned to slots
so the requested pairs land where they should, and the real race runs untouched.
Ranks and the plain `floor(rank / groupSize)` grouping rule are exactly what the
marbles produced.

Impossible requests (a together-group larger than the group size, a pair that is
both "together" and "conflict", names not in the participant list) are reported
before the race rather than silently ignored.

### Determinism

The prediction only holds if the visible race reproduces the headless one
exactly. Anything touching the physics must preserve that:

- every physics-affecting random draw is seeded and keyed by **spawn slot**, not
  by creation order — otherwise renaming a marble would change the race
- the Box2D world is rebuilt for each race; reusing one recycles broadphase
  proxy ids and silently changes the outcome of an identical line-up
- the step interval is computed inside the step loop and marble despawn is
  scheduled on simulation time, so the result does not depend on frame rate
- marbles are created in ascending slot order, for a stable solver ordering

## Development

```bash
npm install
npm start          # dev server
npm run typecheck
npm test
npm run build      # outputs to dist/
```

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`.
