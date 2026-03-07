import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from 'remotion';

const normalizeAssetPath = (assetPath) => {
  if (!assetPath) {
    return null;
  }
  return assetPath.replace(/\\/g, '/').replace(/^\.\//, '');
};

const isTransparentVideo = (assetPath) => {
  if (!assetPath) {
    return false;
  }

  return /\.(mov|webm)$/i.test(assetPath);
};

const resolveAssetPath = (data, track) => {
  if (track.src) {
    return normalizeAssetPath(track.src);
  }

  const assetId = track.assetId;
  if (!assetId) {
    return null;
  }

  const groups = ['video', 'audio', 'image'];
  for (const group of groups) {
    const groupMap = data.assets?.[group];
    if (groupMap?.[assetId]) {
      return normalizeAssetPath(groupMap[assetId]);
    }
  }

  return null;
};

const toVideoStyle = (style = {}) => ({
  position: 'absolute',
  left: style.x ?? 0,
  top: style.y ?? 0,
  width: style.width ?? '100%',
  height: style.height ?? '100%',
  objectFit: style.fit ?? 'cover',
  opacity: style.opacity ?? 1,
});

const toTextStyle = (style = {}) => {
  const textStyle = {
    position: 'absolute',
    left: style.x ?? 0,
    top: style.y ?? 0,
    maxWidth: style.maxWidth,
    width: style.width,
    height: style.height,
    fontFamily: style.fontFamily ?? 'sans-serif',
    fontSize: style.fontSize ?? 48,
    fontWeight: style.fontWeight ?? 700,
    lineHeight: style.lineHeight ?? 1.25,
    color: style.color ?? '#fff',
    textAlign: style.textAlign ?? 'left',
    backgroundColor: style.backgroundColor,
    padding: style.padding,
    borderRadius: style.borderRadius,
    opacity: style.opacity ?? 1,
    whiteSpace: 'pre-wrap',
  };

  if (style.strokeColor) {
    textStyle.WebkitTextStroke = `${style.strokeWidth ?? 2}px ${style.strokeColor}`;
  }

  return textStyle;
};

const getAnimationStyle = (animation, frame, fps, durationInFrames) => {
  if (!animation) {
    return {};
  }

  const enter = animation.enter;
  const exit = animation.exit;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (enter === 'fadeIn') {
    opacity *= interpolate(frame, [0, Math.min(12, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (enter === 'slideUp') {
    const p = spring({
      frame,
      fps,
      config: {damping: 18, stiffness: 120, mass: 0.8},
      durationInFrames: Math.min(18, durationInFrames),
    });
    translateY += interpolate(p, [0, 1], [30, 0]);
    opacity *= interpolate(frame, [0, Math.min(10, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (enter === 'popIn') {
    const p = spring({
      frame,
      fps,
      config: {damping: 15, stiffness: 180, mass: 0.6},
      durationInFrames: Math.min(16, durationInFrames),
    });
    scale *= interpolate(p, [0, 1], [0.85, 1]);
    opacity *= interpolate(frame, [0, Math.min(8, durationInFrames)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  if (exit === 'fadeOut') {
    const outStart = Math.max(0, durationInFrames - 14);
    opacity *= interpolate(frame, [outStart, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  return {
    opacity,
    transform: `translateY(${translateY}px) scale(${scale})`,
  };
};

const TrackVideo = ({track, data}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const srcPath = resolveAssetPath(data, track);

  if (!srcPath) {
    return null;
  }

  const trimStart = track.trimStart ?? 0;
  const trimEnd = track.trimEnd ?? 0;
  const endAt = trimEnd > 0 ? trimStart + Math.max(1, (track.duration ?? 1) - trimEnd) : undefined;

  return (
    <OffthreadVideo
      src={staticFile(srcPath)}
      style={{
        ...toVideoStyle(track.style),
        ...getAnimationStyle(track.animation, frame, fps, track.duration ?? 1),
      }}
      startFrom={trimStart}
      endAt={endAt}
      volume={track.volume ?? 1}
      muted={track.muted ?? false}
      transparent={track.transparent ?? isTransparentVideo(srcPath)}
    />
  );
};

const TrackAudio = ({track, data}) => {
  const frame = useCurrentFrame();
  const srcPath = resolveAssetPath(data, track);

  if (!srcPath) {
    return null;
  }

  const trimStart = track.trimStart ?? 0;
  const trimEnd = track.trimEnd ?? 0;
  const duration = track.duration ?? 1;
  const endAt = trimEnd > 0 ? trimStart + Math.max(1, duration - trimEnd) : undefined;

  const volume = () => {
    let value = track.volume ?? 1;

    if (track.fadeInFrames && track.fadeInFrames > 0) {
      value *= interpolate(frame, [0, track.fadeInFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }

    if (track.fadeOutFrames && track.fadeOutFrames > 0) {
      const fadeOutStart = Math.max(0, duration - track.fadeOutFrames);
      value *= interpolate(frame, [fadeOutStart, duration], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }

    return value;
  };

  return (
    <Audio
      src={staticFile(srcPath)}
      startFrom={trimStart}
      endAt={endAt}
      volume={volume}
    />
  );
};

const TrackText = ({track}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        ...toTextStyle(track.style),
        ...getAnimationStyle(track.animation, frame, fps, track.duration ?? 1),
      }}
    >
      {track.content ?? ''}
    </div>
  );
};

export const TrackComposition = ({data}) => {
  const tracks = data?.tracks ?? [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: data?.composition?.backgroundColor ?? '#000',
      }}
    >
      {tracks.map((track, index) => {
        const from = Math.max(0, track.from ?? 0);
        const duration = Math.max(1, track.duration ?? 1);

        return (
          <Sequence key={track.id ?? `${track.type}-${index}`} from={from} durationInFrames={duration}>
            {track.type === 'video' ? <TrackVideo track={track} data={data} /> : null}
            {track.type === 'audio' ? <TrackAudio track={track} data={data} /> : null}
            {track.type === 'text' ? <TrackText track={track} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
