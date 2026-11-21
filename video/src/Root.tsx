import {Composition} from 'remotion';
import {MetaAcces, TOTAL} from './MetaAcces';
import {TutoFinal, FINAL_DURATION} from './TutoFinal';

export const RemotionRoot: React.FC = () => (
  <>
  <Composition id="MetaTutoFinal" component={TutoFinal} durationInFrames={FINAL_DURATION} fps={30} width={1080} height={1920} />
  <Composition
    id="MetaAcces"
    component={MetaAcces}
    durationInFrames={TOTAL}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{voiceover: null as string | null}}
  />
  </>
);
