# Story To Track

Read this file when turning a Chinese story or beat sheet into `track.json`.

## Scene planning

- Split the input story into `3-8` scenes
- Keep each scene roughly `3-5` seconds unless dialogue density forces it longer
- For each scene, decide:
  - short scene summary
  - mood
  - action
  - background need
  - cast count from `1-4`
  - dialogue lines

Prefer readable pacing over high cut frequency.

## Asset matching

### Characters

- Match against `describe.json` using `title + description`
- Prefer transparent `webm`
- Use concrete identities only for `characterLabel`
- Do not turn abstract concepts into characters
- Reuse across different scenes if necessary
- Do not duplicate the same character inside the same scene group

### Backgrounds

- Match against `img-describe.json` using `title + description`
- Prefer the most semantically correct location first
- Check whether the image leaves standing room for characters and subtitles
- Use one background image per scene by default
- If no perfect match exists, choose the closest location or mood and document the fallback in `meta.notes`

## Track generation

### Background tracks

- Use `type: "image"`
- Use `layout.kind: "background"`
- Stretch to full frame
- Default `fit: "cover"`

### Character tracks

- Use `type: "video"`
- Use `layout.kind: "character"`
- Use the same `layout.groupId` for the cast within one scene
- Let automatic layout handle box placement unless the user explicitly needs manual positioning
- Set `characterLabel` to a concrete audience-readable role

### Subtitle and title tracks

- Use yellow title text with black outline near the top
- Use white dialogue text with black outline
- Keep dialogue as direct spoken lines, not narration or explanation
- Do not prefix dialogue with `角色名：`
- Add `speakerTrackId` when a dialogue line belongs to a specific visible character
- Let speaker-bound subtitles stay near the character instead of on the opposite side of frame

## Timing rules

- Short dialogue should stay on screen for at least about `2` seconds
- Longer lines should stay longer based on character count
- If a scene contains multiple dialogue lines, extend the scene instead of forcing flashing subtitles
- Run `npm run track:fit-dialogue` after editing dialogue or scene order

## Style defaults

- Title / role label color: `#ffd426`
- Dialogue color: `#ffffff`
- Stroke color: `#000000`
- Dialogue font size: around `56-62`
- Title font size: around `84-96`
- Font weight: heavy, around `900`

## Final checks

- Make sure every `assetId` exists in `assets`
- Make sure total duration matches the last track end
- Make sure no subtitle blocks the main face unnecessarily
- Make sure no scene contains duplicate copies of the same character identity
