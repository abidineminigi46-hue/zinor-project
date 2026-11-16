import { Composition } from "remotion";
import { AbayaAd } from "./AbayaAd";
import { FPS, TOTAL } from "./data";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AbayaAd"
      component={AbayaAd}
      durationInFrames={Math.round(TOTAL * FPS)}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
