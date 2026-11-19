import { Composition } from "remotion";
import { AbayaAd } from "./AbayaAd";
import { AbayaAdV2 } from "./AbayaAdV2";
import { ChamsReel } from "./chams/ChamsReel";
import { SalonReel } from "./salon/SalonReel";
import { DURATION as CHAMS_DURATION, FPS as CHAMS_FPS } from "./chams/data";
import { FPS, TOTAL } from "./data";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AbayaAd"
        component={AbayaAd}
        durationInFrames={Math.round(TOTAL * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="AbayaAdV2"
        component={AbayaAdV2}
        durationInFrames={Math.round(TOTAL * FPS)}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="ChamsReel"
        component={ChamsReel}
        durationInFrames={Math.round(CHAMS_DURATION * CHAMS_FPS)}
        fps={CHAMS_FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="SalonReel"
        component={SalonReel}
        durationInFrames={Math.round(CHAMS_DURATION * CHAMS_FPS)}
        fps={CHAMS_FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
