import React from 'react';
import {Composition, registerRoot} from 'remotion';
import trackData from '../track.json';
import {TrackComposition} from './TrackComposition';

const Root = () => {
  const comp = trackData.composition;

  return (
    <>
      <Composition
        id={comp.id ?? 'TrackComposition'}
        component={TrackComposition}
        fps={comp.fps ?? 30}
        width={comp.width ?? 1080}
        height={comp.height ?? 1920}
        durationInFrames={comp.durationInFrames ?? 300}
        defaultProps={{data: trackData}}
      />
    </>
  );
};

registerRoot(Root);
