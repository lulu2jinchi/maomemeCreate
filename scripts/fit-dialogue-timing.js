const fs = require('fs');
const path = require('path');

const SCENE_ID_PATTERNS = [
  /(?:^|_)scene_(\d+)(?:_|$)/,
  /^bg_scene_(\d+)(?:_|$)/,
];

const FRAME_CONSTANTS = {
  minSubtitleFrames: 72,
  baseSubtitleFrames: 56,
  perCharacterFrames: 4,
  punctuationPauseFrames: 4,
  subtitleLeadFrames: 28,
  subtitleTailFrames: 12,
  subtitleOverlapFrames: 10,
  minTitleFrames: 72,
};

const getTrackStart = (track) => Number(track.from || 0);
const getTrackDuration = (track) => Math.max(1, Number(track.duration || 1));
const getTrackEnd = (track) => getTrackStart(track) + getTrackDuration(track);

const isBackgroundTrack = (track) => track?.type === 'image' && track?.layout?.kind === 'background';
const isTitleTrack = (track) => track?.type === 'text' && /(^|_)title(_|$)/.test(track.id || '');
const isSubtitleTrack = (track) => track?.type === 'text' && !isTitleTrack(track);

const extractSceneNumber = (trackId) => {
  if (!trackId) {
    return null;
  }

  for (const pattern of SCENE_ID_PATTERNS) {
    const match = trackId.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
};

const countReadableCharacters = (text) => {
  if (!text) {
    return 0;
  }

  return Array.from(String(text).replace(/\s+/g, '')).filter((char) => !/[，。！？；：、“”"'‘’（）()《》【】,.!?;:]/.test(char)).length;
};

const countPauses = (text) => {
  if (!text) {
    return 0;
  }

  const matches = String(text).match(/[，。！？；：,.!?;:]/g);
  return matches ? matches.length : 0;
};

const getAutoSubtitleDuration = (text, currentDuration) => {
  const readableChars = countReadableCharacters(text);
  const pauses = countPauses(text);
  const autoFrames =
    FRAME_CONSTANTS.baseSubtitleFrames +
    readableChars * FRAME_CONSTANTS.perCharacterFrames +
    pauses * FRAME_CONSTANTS.punctuationPauseFrames;

  return Math.max(currentDuration || 0, FRAME_CONSTANTS.minSubtitleFrames, autoFrames);
};

const buildSceneMap = (tracks) => {
  const scenes = new Map();

  tracks.forEach((track) => {
    if (isBackgroundTrack(track)) {
      return;
    }

    const sceneNumber = extractSceneNumber(track.id);
    if (sceneNumber === null) {
      return;
    }

    const existing = scenes.get(sceneNumber) || {
      sceneNumber,
      oldStart: Number.POSITIVE_INFINITY,
      oldEnd: 0,
      tracks: [],
    };

    existing.oldStart = Math.min(existing.oldStart, getTrackStart(track));
    existing.oldEnd = Math.max(existing.oldEnd, getTrackEnd(track));
    existing.tracks.push(track);
    scenes.set(sceneNumber, existing);
  });

  return [...scenes.values()]
    .filter((scene) => Number.isFinite(scene.oldStart) && scene.tracks.length > 0)
    .sort((left, right) => left.sceneNumber - right.sceneNumber);
};

const buildSceneShiftResolver = (scenes) => {
  const shifts = scenes.map((scene) => ({
    oldEnd: scene.oldEnd,
    delta: scene.totalDelta || 0,
  }));

  return (frame) => {
    let appliedDelta = 0;

    for (const shift of shifts) {
      if (frame >= shift.oldEnd) {
        appliedDelta = shift.delta;
      } else {
        break;
      }
    }

    return appliedDelta;
  };
};

const retimeScene = (scene) => {
  const oldSceneDuration = scene.oldEnd - scene.oldStart;
  const shiftedOldEnd = scene.newStart + oldSceneDuration;
  const subtitleTracks = scene.tracks
    .filter((track) => isSubtitleTrack(track))
    .sort((left, right) => getTrackStart(left) - getTrackStart(right));
  const titleTracks = scene.tracks
    .filter((track) => isTitleTrack(track))
    .sort((left, right) => getTrackStart(left) - getTrackStart(right));
  const sceneRelativeShift = scene.newStart - scene.oldStart;

  for (const track of scene.tracks) {
    track.from = getTrackStart(track) + sceneRelativeShift;
  }

  for (const track of titleTracks) {
    track.duration = Math.max(getTrackDuration(track), FRAME_CONSTANTS.minTitleFrames);
  }

  let previousSubtitleEnd = null;

  for (const track of subtitleTracks) {
    const originalRelativeStart = getTrackStart(track) - scene.newStart;
    const minimumStart = scene.newStart + FRAME_CONSTANTS.subtitleLeadFrames;
    const autoDuration = getAutoSubtitleDuration(track.content, getTrackDuration(track));
    const earliestFollowUpStart =
      previousSubtitleEnd === null
        ? minimumStart
        : Math.max(minimumStart, previousSubtitleEnd - FRAME_CONSTANTS.subtitleOverlapFrames);
    const nextFrom = Math.max(scene.newStart + originalRelativeStart, earliestFollowUpStart);

    track.from = nextFrom;
    track.duration = autoDuration;
    previousSubtitleEnd = getTrackEnd(track);
  }

  let newSceneEnd = shiftedOldEnd;

  for (const track of scene.tracks) {
    newSceneEnd = Math.max(newSceneEnd, getTrackEnd(track));
  }

  if (subtitleTracks.length > 0) {
    newSceneEnd = Math.max(newSceneEnd, getTrackEnd(subtitleTracks[subtitleTracks.length - 1]) + FRAME_CONSTANTS.subtitleTailFrames);
  }

  const sceneGrowth = newSceneEnd - shiftedOldEnd;

  if (sceneGrowth > 0) {
    for (const track of scene.tracks) {
      const originallyCoveredWholeScene = getTrackStart(track) === scene.newStart && getTrackEnd(track) === shiftedOldEnd;
      const isCharacterOrAudio = track.type === 'video' || track.type === 'audio';

      if (isCharacterOrAudio && originallyCoveredWholeScene) {
        track.duration = getTrackDuration(track) + sceneGrowth;
      }
    }
  }

  scene.newEnd = newSceneEnd;
};

const updateBackgroundTracks = (tracks, scenes) => {
  const backgroundTracks = tracks.filter((track) => isBackgroundTrack(track));

  for (const track of backgroundTracks) {
    const oldStart = getTrackStart(track);
    const oldEnd = getTrackEnd(track);
    const overlappedScenes = scenes.filter((scene) => scene.oldStart < oldEnd && scene.oldEnd > oldStart);

    if (overlappedScenes.length === 0) {
      continue;
    }

    track.from = overlappedScenes[0].newStart;
    track.duration = overlappedScenes[overlappedScenes.length - 1].newEnd - track.from;
  }
};

const updateUnscopedTracks = (tracks, scenes) => {
  const resolveShift = buildSceneShiftResolver(scenes);

  for (const track of tracks) {
    if (isBackgroundTrack(track)) {
      continue;
    }

    if (extractSceneNumber(track.id) !== null) {
      continue;
    }

    track.from = getTrackStart(track) + resolveShift(getTrackStart(track));
  }
};

const appendMetaNote = (data) => {
  const note = '对白字幕会按字数自动延长；多人连续对白时会自动把 scene 撑开。';
  const currentNotes = String(data.meta?.notes || '');

  if (currentNotes.includes(note)) {
    return;
  }

  if (!data.meta) {
    data.meta = {};
  }

  data.meta.notes = currentNotes ? `${currentNotes} ${note}` : note;
};

const rebalanceDialogueTiming = (data) => {
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
  const scenes = buildSceneMap(tracks);

  if (scenes.length === 0) {
    return data;
  }

  let accumulatedShift = 0;

  for (const scene of scenes) {
    scene.newStart = scene.oldStart + accumulatedShift;
    retimeScene(scene);
    scene.totalDelta = scene.newEnd - scene.oldEnd;
    accumulatedShift += scene.newEnd - (scene.oldStart + accumulatedShift + (scene.oldEnd - scene.oldStart));
  }

  updateBackgroundTracks(tracks, scenes);
  updateUnscopedTracks(tracks, scenes);
  appendMetaNote(data);

  const maxEnd = tracks.reduce((max, track) => Math.max(max, getTrackEnd(track)), 0);
  if (!data.composition) {
    data.composition = {};
  }
  data.composition.durationInFrames = maxEnd;

  return data;
};

const runCli = () => {
  const inputArg = process.argv[2] || 'track.json';
  const inputPath = path.resolve(process.cwd(), inputArg);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);

  rebalanceDialogueTiming(data);

  fs.writeFileSync(inputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  process.stdout.write(`Dialogue timing rebalanced: ${inputPath}\n`);
};

if (require.main === module) {
  runCli();
}

module.exports = {
  FRAME_CONSTANTS,
  buildSceneMap,
  countReadableCharacters,
  extractSceneNumber,
  getAutoSubtitleDuration,
  rebalanceDialogueTiming,
};
