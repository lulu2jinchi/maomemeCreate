const parseAspectRatio = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) {
    return null;
  }

  return {
    width,
    height,
    ratio: width / height,
  };
};

const hasManualBox = (style = {}) => {
  return ['x', 'y', 'width', 'height'].every((key) => typeof style[key] === 'number');
};

const getTrackLayoutKind = (track) => {
  if (track.layout?.kind) {
    return track.layout.kind;
  }

  if (track.type === 'image') {
    return 'background';
  }

  return null;
};

const getCharacterGroupKey = (track, fallbackIndex) => {
  if (track.layout?.groupId) {
    return track.layout.groupId;
  }

  return `${track.from ?? 0}:${track.duration ?? 1}:${fallbackIndex}`;
};

export const buildCharacterGroups = (tracks) => {
  const groups = new Map();

  tracks.forEach((track, index) => {
    if (getTrackLayoutKind(track) !== 'character') {
      return;
    }

    const key = getCharacterGroupKey(track, index);
    const list = groups.get(key) ?? [];
    list.push({track, index});
    groups.set(key, list);
  });

  groups.forEach((list) => {
    list.sort((left, right) => {
      const leftIndex = left.track.layout?.slotIndex ?? left.index;
      const rightIndex = right.track.layout?.slotIndex ?? right.index;
      return leftIndex - rightIndex;
    });
  });

  return groups;
};

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const getDefaultBackgroundStyle = (composition) => {
  return {
    x: 0,
    y: 0,
    width: composition.width,
    height: composition.height,
    fit: 'cover',
    opacity: 1,
    zIndex: 0,
  };
};

const getSlotCenters = (slotCount) => {
  if (slotCount <= 1) {
    return [0.5];
  }

  if (slotCount === 2) {
    return [0.3, 0.7];
  }

  if (slotCount === 3) {
    return [0.2, 0.5, 0.8];
  }

  return [0.14, 0.38, 0.62, 0.86];
};

const getCharacterStyle = ({
  composition,
  track,
  group,
  indexInGroup,
}) => {
  const slotCount = clamp(track.layout?.slotCount ?? group.length, 1, 4);
  const slotIndex = clamp(track.layout?.slotIndex ?? indexInGroup, 0, slotCount - 1);
  const centers = getSlotCenters(slotCount);
  const centerX = centers[slotIndex] ?? 0.5;
  const parsed = parseAspectRatio(track.layout?.aspectRatio ?? track.aspectRatio);
  const ratio = parsed?.ratio ?? 0.9;

  const baseWidthByCount = {
    1: composition.width * 0.5,
    2: composition.width * 0.31,
    3: composition.width * 0.235,
    4: composition.width * 0.19,
  };
  const maxHeightByCount = {
    1: composition.height * 0.56,
    2: composition.height * 0.46,
    3: composition.height * 0.38,
    4: composition.height * 0.31,
  };

  let width = baseWidthByCount[slotCount] ?? composition.width * 0.22;
  let baseline = composition.height * 0.79;

  if (ratio <= 0.75) {
    width *= 0.88;
    baseline -= composition.height * 0.025;
  } else if (ratio >= 1.2) {
    width *= 1.16;
    baseline += composition.height * 0.015;
  }

  let height = width / ratio;
  const maxHeight = maxHeightByCount[slotCount] ?? composition.height * 0.36;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const minX = composition.width * 0.04;
  const maxX = composition.width - width - minX;
  const minY = composition.height * 0.2;
  const maxY = composition.height * 0.78 - height;

  return {
    x: clamp(composition.width * centerX - width / 2, minX, maxX),
    y: clamp(baseline - height, minY, maxY),
    width,
    height,
    fit: 'contain',
    opacity: 1,
    zIndex: 20 + slotIndex,
  };
};

export const resolveTrackStyle = ({
  composition,
  track,
  allTracks,
  trackIndex,
  characterGroups,
}) => {
  const style = track.style ?? {};
  if (hasManualBox(style)) {
    return style;
  }

  const layoutKind = getTrackLayoutKind(track);
  if (layoutKind === 'background') {
    return {
      ...getDefaultBackgroundStyle(composition),
      ...style,
    };
  }

  if (layoutKind === 'character') {
    const groups = characterGroups ?? buildCharacterGroups(allTracks);
    const key = getCharacterGroupKey(track, trackIndex);
    const group = groups.get(key) ?? [{track, index: trackIndex}];
    const indexInGroup = group.findIndex((item) => item.index === trackIndex);

    return {
      ...getCharacterStyle({
        composition,
        track,
        group,
        indexInGroup: indexInGroup >= 0 ? indexInGroup : 0,
      }),
      ...style,
    };
  }

  if (track.type === 'text') {
    return {
      zIndex: 100,
      ...style,
    };
  }

  return style;
};
