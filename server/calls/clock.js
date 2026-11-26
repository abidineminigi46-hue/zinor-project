// ساعة قابلة للتحكّم في التجارب (باش نجرّبو الفترات بلا ما نستناو)
let fake = null;
export const clockNow = () => (fake ? new Date(fake.getTime()) : new Date());
export const setClock = (d) => { fake = d ? new Date(d) : null; };
