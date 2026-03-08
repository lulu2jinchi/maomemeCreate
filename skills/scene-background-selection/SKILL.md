---
name: scene-background-selection
description: Use this skill when choosing background images from img-describe.json for story scenes, track.json generation, Remotion scene planning, or any task where background choice should follow project-specific taste instead of hardcoded scoring rules.
---

# Scene Background Selection

Choose backgrounds by editorial judgment, not by fixed scoring code.

Use this skill when:
- selecting a background for one scene from `img-describe.json`
- selecting a sequence of backgrounds for multiple scenes
- reviewing whether an existing background choice fits the scene
- generating `track.json` or scene plans that need image backgrounds

## Workflow

1. Read the scene text first.
   Focus on:
   - exact place: office, classroom, corridor, street, station, seaside, courtyard, bedroom
   - shot need: empty center, long corridor, window side, table side, bench, doorway, crosswalk
   - time and mood: daytime, sunset, night, blue-toned, warm-toned
   - staging need: how many characters may need to stand in frame, and whether subtitles also need space

2. Read only the relevant entries from `img-describe.json`.
   Do not pick by folder name alone.
   Prefer the image whose `description` matches the scene's concrete setting, composition, and usable empty space.

3. Check whether the image is stageable.
   Ask:
   - Is there enough blank area for the characters?
   - Is there a natural place for subtitles?
   - Does the composition support the intended blocking?
   - If two or more characters appear, is there enough width or center space?

4. Prefer semantic accuracy over visual variety.
   A correct classroom is better than a visually pretty but wrong street.
   A corridor with clear standing space is better than a crowded corridor with better color.

5. Only after semantic fit is established, use tie-breakers.
   Tie-breakers:
   - stronger composition for character placement
   - clearer time-of-day match
   - less repetition with nearby scenes
   - lower `common_level` value if all else is close

## Project Rules

- Use `img-describe.json` as the source of truth.
- Treat each image `description` as the primary matching surface.
- Do not reduce selection to keywords alone.
- Do not assume a whole folder means one interchangeable scene type.
- Avoid repeating the exact same image in adjacent scenes unless the story intentionally stays in the same location.
- If the scene is ambiguous, return the best choice plus 2 alternates.

## Output Format

When you choose a background, return:
- chosen image path
- 1 short reason tying the image to the scene
- where characters can be placed
- if useful, 1-2 alternate candidates

Keep the reason concrete. Good reasons mention scene fit and blocking.

Good:
- `img/实景--办公室/13369836404034194.jpeg`
  Reason: night office, city visible outside the window, and the desk-side composition leaves room for one seated character.

Bad:
- `img/办公室/...`
  Reason: office vibe.

## References

Read [references/matching-logic.md](references/matching-logic.md) when you need the full taste rules and decision checklist.
