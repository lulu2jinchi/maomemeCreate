# Matching Logic

## Core Idea

This project wants AI-led background selection, closer to a director or editor choosing a plate, not a deterministic ranker.

The question is not "which image shares the most keywords".

The question is:
"Which image gives this scene the right place, the right mood, and enough usable space to stage the characters and subtitles?"

## What To Look At

### 1. Exact Place

Match the real place first:
- office
- classroom
- corridor
- campus exterior
- street
- station / train / bus
- bedroom
- living room
- courtyard
- indoor hall
- building exterior
- seaside / riverside

Do not accept a near miss if the story is specific.

Examples:
- "在工位继续加班" should strongly prefer a desk-side office, not a random lobby.
- "在教学楼走廊堵人" should prefer a corridor with a clear central lane, not a classroom.
- "在车站等人" should prefer a platform or station corridor, not generic city exterior.

### 2. Blocking Space

Pick backgrounds that can actually hold the characters.

For 1 character:
- center space is usually enough
- window-side, desk-side, bench-side, or doorway framing can work

For 2 characters:
- prefer scenes with left-right separation
- corridor center, classroom front, office open area, street lane, courtyard open ground

For 3-4 characters:
- prefer wider scenes with obvious empty zones
- avoid cramped corners and overly busy compositions

### 3. Subtitle Space

Subtitles should not crush faces or erase the scene.

Prefer images that naturally provide:
- top blank space
- shoulder-above empty area
- open corridor air
- sky, wall, or floor area where text can breathe

Avoid:
- cluttered foregrounds
- dense signage everywhere
- compositions where every area is already visually busy

### 4. Time and Mood

Use time-of-day and color temperature as a second-pass filter:
- daytime
- sunset / warm light
- night / blue tone

Examples:
- confrontation, overtime, loneliness: night office, blue street, dim corridor can help
- reunion, relief, celebration: warmer scenes are often better
- memory or transition: sunset often works better than harsh daylight

### 5. Specific Composition Clues

Descriptions in `img-describe.json` already encode usable staging hints.
Pay attention to phrases like:
- "人物适合站在走廊中线"
- "人物适合坐在沙发中央"
- "人物适合站在门口正前方"
- "人物适合站在斑马线中央"

These are stronger than generic folder labels.

## Tie-Breaking

If two images both fit:

1. prefer the image with better character placement
2. then prefer the image with better subtitle safety
3. then prefer the closer mood/time-of-day match
4. then prefer less repetition with surrounding scenes
5. then prefer lower `common_level`

## Repeat Control

Avoid:
- same exact image in adjacent scenes
- same small cluster of nearly identical images over and over

Allow repetition only when:
- the story intentionally remains in one location
- the continuity is useful
- the scene is clearly a continuation of the previous shot

## Recommended Reply Style

When selecting backgrounds, explain choices in plain language:

- what place it matches
- what part of the composition makes it usable
- where characters should be placed
- why it is better than the nearest alternative

Short example:

- Pick: `./实景--学校/13369807445029098.jpeg`
- Why: real campus corridor, long center lane, and enough clean wall and floor space for two speaking characters.
- Placement: one character left of center, one right of center, subtitles above each speaker.
