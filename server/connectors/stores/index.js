// سجلّ موصّلات المتاجر — زيد سطر هنا كي تزيد منصّة جديدة
import shopify from './shopify.js';
import ayor from './ayor.js';
import lightfunnels from './lightfunnels.js';
import woocommerce from './woocommerce.js';
import justsell from './justsell.js';
import youcan from './youcan.js';

export const STORES = Object.fromEntries([shopify, ayor, lightfunnels, woocommerce, justsell, youcan].map((c) => [c.platform, c]));
export const getStoreConnector = (p) => STORES[p];
