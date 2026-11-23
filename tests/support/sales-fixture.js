// Test-only records so the crawler (t8) can open every material-sale state: waiting for finance, invoiced with a
// partial collection, and rejected. Not part of the product seed.
module.exports = function salesFixture(seed) {
  const who = u => Object.values(seed.team).find(t => t.username === u)?.id || '';
  const it = id => seed.items[id] || {};
  const y = new Date().getFullYear();
  const day = new Date().toISOString().slice(0, 10);
  const at = new Date().toISOString();
  const buyer = (name, country, city) => ({ name, country, city, phone: '+96265550000', vat: 'JO-778812', contact: 'مسؤول الاستلام', address: 'المنطقة الصناعية' });
  const ln = (id, itemId, qty, price) => ({ id, itemId, name: it(itemId).name, unit: it(itemId).unit, qty, ...(price ? { price } : {}) });
  return {
    sales: {
      sfx1: { id: 'sfx1', code: `MS-${y}-901`, buyer: buyer('شركة الاختبار للطاقة', 'الأردن', 'عمّان'), lines: [ln('a1', 'ipnl', 10)], note: 'تسليم من المستودع', status: 'fin', by: who('store'), at },
      sfx2: { id: 'sfx2', code: `MS-${y}-902`, buyer: buyer('مؤسسة الاختبار للمقاولات', 'السعودية', 'الرياض'), lines: [ln('b1', 'ic6', 100, 5)], note: '', status: 'partial', by: who('store'), at,
        currency: 'SAR', rate: 1, taxType: 'local', invoiceNo: `SI-${y}-901`, invoiceDate: day, payMode: 'credit', dueDate: day, payTerms: 'خلال 30 يوماً',
        amount: 500, vat: 75, total: 575, finBy: who('finance'), finAt: at, payments: [{ amount: 200, date: day, method: 'تحويل بنكي', ref: 'TRF-1', by: who('finance') }] },
      sfx3: { id: 'sfx3', code: `MS-${y}-903`, buyer: buyer('شركة الاختبار للتوريدات', 'الإمارات', 'دبي'), lines: [ln('c1', 'imc4', 30)], note: '', status: 'rejected', rejectNote: 'السعر المتفق عليه غير موثق', by: who('store'), at },
    },
    moves: {
      mfx2: { id: 'mfx2', itemId: 'ic6', qty: 100, from: 'MAIN', to: 'SALE', kind: 'sale', ref: `MS-${y}-902`, saleId: 'sfx2', cost: Number(it('ic6').cost) || 0, at, by: who('finance') },
    },
  };
};
