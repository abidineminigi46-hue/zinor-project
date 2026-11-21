// سجلّ موصّلات شركات التوصيل — زيد سطر هنا كي تزيد شركة جديدة
import yalidine from './yalidine.js';
import zrExpress from './zr-express.js';

export const CARRIERS = { [zrExpress.code]: zrExpress, [yalidine.code]: yalidine };
export const getCarrier = (code) => CARRIERS[code];
