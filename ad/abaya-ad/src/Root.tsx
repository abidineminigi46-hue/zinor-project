import { Composition } from "remotion";
import { AbayaAd } from "./AbayaAd";
import { AbayaAdV2 } from "./AbayaAdV2";
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
    </>
  );
};
