/* Tests de la logique pure : node tests/logic.test.js */
var assert = require('assert');
var L = require('../logic.js');
var D = 86400000;
var now = new Date(2026, 9, 12, 12, 0).getTime();
function day(n) { return new Date(2026, 9, 12 + n, 10, 0).getTime(); }
var n = 0;
function t(name, fn) { fn(); n++; }

t('symptômes synonymes', function () {
  assert(L.sameSymptom('Maux de tête', 'migraine'));
  assert(L.sameSymptom('Nausées', 'nausée'));
  assert(!L.sameSymptom('Fatigue', 'Nausées'));
});

t('posologie progressive et stock', function () {
  var d = L.newDrug({ name: 'X', slots: ['morning'], steps: [
    { until: L.ymd(day(-1)), doses: { morning: 0.5 } }, { until: '', doses: { morning: 1 } }],
    stock: { count: 10, asOf: day(-3) } });
  assert.strictEqual(L.dailyDose(d, L.startOfDay(day(-2))), 0.5);
  assert.strictEqual(L.dailyDose(d, L.startOfDay(day(0))), 1);
  /* jours -2 et -1 comptés : 0,5 + 0,5 -> reste 9 */
  assert.strictEqual(L.stockAt(d, now), 9);
  var s = L.stockInfo(d, now);
  assert.strictEqual(s.daysLeft, 9);
  assert.strictEqual(L.ymd(s.lastDay), L.ymd(day(8)));
  assert(!s.low);
});

t('stock bas et traitement terminé', function () {
  var d = L.newDrug({ name: 'Y', slots: ['evening'], steps: [{ until: '', doses: { evening: 1 } }], stock: { count: 3, asOf: day(0) } });
  assert(L.stockInfo(d, now).low);
  var e = L.newDrug({ name: 'Z', slots: ['evening'], steps: [{ until: L.ymd(day(2)), doses: { evening: 1 } }], stock: { count: 30, asOf: day(0) } });
  var s = L.stockInfo(e, now);
  assert(s.ended && !s.low && s.daysLeft === 3);
  assert.strictEqual(L.stockInfo(L.newDrug({ name: 'W' }), now), null);
});

t('rappels de pharmacie 21 / 80 jours', function () {
  var data = L.emptyData();
  data.pharmacy.push({ id: 'a', name: 'p', ts: day(-10), rx: 'monthly', items: [] });
  data.pharmacy.push({ id: 'b', name: 'p', ts: day(-10), rx: 'quarterly', items: [] });
  data.pharmacy.push({ id: 'c', name: 'p', ts: day(-40), rx: 'monthly', items: [] });
  var r = L.pharmacyReminders(data, now);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(L.ymd(r[0].day), L.ymd(day(11)));
  assert.strictEqual(r[0].daysLeft, 11);
  assert.strictEqual(L.ymd(r[1].day), L.ymd(day(70)));
  assert.strictEqual(r[1].daysLeft, 70);
  data.pharmacy.push({ id: 'd', name: 'p', ts: day(-30), rx: 'monthly', items: [] });
  data.pharmacy = data.pharmacy.filter(function (x) { return x.id !== 'a'; });
  var due = L.pharmacyReminders(data, now).filter(function (x) { return x.rx === 'monthly'; })[0];
  assert(due.due);
});

t('notifications programmées', function () {
  var data = L.emptyData();
  data.drugs.push(L.newDrug({ name: 'Sertraline', slots: ['morning'], steps: [{ until: '', doses: { morning: 1 } }] }));
  data.slots.morning.notify = true;
  data.slots.morning.time = '08:00';
  var up = L.upcomingNotifications(data, now, 2);
  assert(up.length === 2 && up[0].body.indexOf('Sertraline 1') === 0);
  assert(up[0].ts > now);
  data.slots.morning.hideNames = true;
  assert(L.upcomingNotifications(data, now, 1)[0].body.indexOf('Sertraline') < 0);
  data.slots.noon.notify = true; /* midi désactivé : pas de notification */
  assert(L.upcomingNotifications(data, now, 1).every(function (x) { return x.slot !== 'noon'; }));
});

t('causes possibles', function () {
  var data = L.emptyData();
  data.diseases.push({ id: 'm1', name: 'Migraine', symptoms: ['Maux de tête'], diagnosed: '', note: '' });
  data.drugs.push(L.newDrug({ name: 'Sertraline', action: 'Antidépresseur', sideEffects: ['Nausées', 'Maux de tête'] }));
  data.symptoms.push({ id: 's', name: 'Mal de tête', ts: day(-1) });
  data.symptoms.push({ id: 's2', name: 'Fatigue', ts: day(-1) });
  data.changes.push({ id: 'c', name: 'Sertraline', ts: day(-3), how: 'Début' });
  var c = L.causesFor(data, 'Maux de tête', now, null);
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].kind, 'drug'); /* modification récente : en premier */
  assert(L.causesFor(data, 'Fatigue', now, null).length === 0);
  assert(L.updateCauses(data, now, 6) === true);
  assert(L.updateCauses(data, now, 6) === false);
  assert.strictEqual(Object.keys(data.causes).length, 2);
});

t('sauvegarde et import', function () {
  var data = L.emptyData();
  data.drugs.push(L.newDrug({ name: 'A', slots: ['morning'], stock: { count: 5, asOf: now } }));
  data.diseases.push({ id: 'x', name: 'M', symptoms: ['a', 'a', 'b'] });
  var back = L.normalizeImported(JSON.parse(JSON.stringify(data)));
  assert.strictEqual(back.drugs.length, 1);
  assert.deepStrictEqual(back.diseases[0].symptoms, ['a', 'b']);
  assert.strictEqual(back.slots.evening.enabled, true);
  var old = L.normalizeImported({ symptoms: [{ ts: 1, name: 'x' }] });
  assert.strictEqual(old.slots.noon.enabled, false);
  assert.strictEqual(old.pharmacy.length, 0);
});

t('réponses IA', function () {
  var r = L.parseChatResponse('{"reply":"ok","events":[{"type":"pharmacy","detail":"trimestrielle"}]}', now);
  assert.strictEqual(r.events[0].type, 'pharmacy');
  assert.strictEqual(r.events[0].name, 'Passage à la pharmacie');
  var di = L.parseDiseaseInfo('```json\n{"symptoms":["a","A","b"],"treatments":[{"name":"X","action":"y"}]}\n```');
  assert.deepStrictEqual(di.symptoms, ['a', 'b']);
  assert.strictEqual(L.parseDrugInfo('pas du json'), null);
  assert.strictEqual(L.parseAdvice('{"note":" Salut "}'), 'Salut');
});

console.log(n + ' groupes de tests réussis');

/* Prise progressive avec dose en mg : une gélule par prise pour le stock */
(function () {
  var assert = require('assert'), L = require('../logic.js');
  var d = L.emptyData();
  var drug = L.newDrug({ id: 'p', name: 'Sertraline', slots: ['morning'], stock: { count: 10, asOf: new Date(2026, 9, 1).getTime() },
    steps: [{ until: '2026-10-05', doses: { morning: 1 }, dose: '25 mg' }, { until: '', doses: { morning: 1 }, dose: '50 mg' }] });
  d.drugs.push(drug); d.slots.morning.enabled = true; d.slots.morning.notify = true;
  var day1 = new Date(2026, 9, 3).getTime(), day2 = new Date(2026, 9, 8).getTime();
  assert.strictEqual(L.slotDrugs(d, 'morning', day1)[0].label, '25 mg');
  assert.strictEqual(L.slotDrugs(d, 'morning', day2)[0].label, '50 mg');
  assert.ok(/25 mg matin jusqu/.test(L.posologyText(drug)) && /puis 50 mg matin/.test(L.posologyText(drug)), L.posologyText(drug));
  assert.strictEqual(L.stockAt(drug, new Date(2026, 9, 6).getTime()), 6);
  console.log('prise progressive en mg : ok');
})();

/* Prises « si besoin » : elles retirent des comprimés du stock, en plus de la posologie régulière */
(function () {
  var assert = require('assert'), L = require('../logic.js');
  var d = L.emptyData(), asOf = new Date(2026, 9, 1, 9).getTime();
  var dol = L.newDrug({ id: 'x', name: 'Doliprane', stock: { count: 16, asOf: asOf } });
  var alp = L.newDrug({ id: 'y', name: 'Alprazolam', slots: ['evening'], steps: [{ until: '', doses: { evening: 1 } }], stock: { count: 30, asOf: asOf } });
  d.drugs.push(dol, alp);
  d.meds.push({ id: 'a', name: 'Doliprane', ts: asOf + 3600000, dose: '1 g', qty: 2 });
  d.meds.push({ id: 'b', name: 'doliprane 1000', ts: asOf + 7200000, dose: '2 comprimés' });
  d.meds.push({ id: 'c', name: 'Doliprane', ts: asOf + 9000000, dose: '1 g' });
  d.meds.push({ id: 'e', name: 'Alprazolam', ts: new Date(2026, 9, 3, 15).getTime(), dose: '0,25 mg', qty: 1 });
  d.meds.push({ id: 'f', name: 'Doliprane', ts: asOf - 3600000, dose: '1 g', qty: 5 });
  var now = new Date(2026, 9, 5, 12).getTime();
  assert.strictEqual(L.medQty({ dose: '2 comprimés' }), 2);
  assert.strictEqual(L.medQty({ dose: '1 g' }), 1);
  assert.strictEqual(L.stockAt(dol, now, d), 16 - 2 - 2 - 1);
  assert.strictEqual(L.stockAt(dol, now), 16);
  assert.strictEqual(L.stockAt(alp, now, d), 30 - 3 - 1);
  assert.strictEqual(L.stockInfo(dol, now, d).daysLeft, null);
  assert.ok(L.stockInfo(dol, now, d).remaining === 11 && !L.stockInfo(dol, now, d).low);
  assert.strictEqual(L.matchDrug(d, 'Doliprane 1000').id, 'x');
  assert.strictEqual(L.matchDrug(d, 'Dolipra'), null);
  console.log('stock des prises si besoin : ok');
})();

/* « Fait » : prise confirmée une fois par jour, sans toucher au stock (déjà décompté par la posologie) */
(function () {
  var assert = require('assert'), L = require('../logic.js');
  var d = L.emptyData(), day = new Date(2026, 9, 5, 15).getTime();
  var drug = L.newDrug({ id: 'z', name: 'Sertraline', slots: ['morning'], steps: [{ until: '', doses: { morning: 1 } }], stock: { count: 10, asOf: new Date(2026, 9, 1).getTime() } });
  d.drugs.push(drug);
  var before = L.stockAt(drug, day, d);
  assert.strictEqual(L.takenOn(d, 'morning', day), null);
  var r = L.markTaken(d, 'morning', day, day);
  assert.strictEqual(L.markTaken(d, 'morning', day, day + 1).id, r.id);
  assert.strictEqual(d.taken.length, 1);
  assert.strictEqual(L.stockAt(drug, day, d), before);
  L.unmarkTaken(d, 'morning', day);
  assert.strictEqual(L.takenOn(d, 'morning', day), null);
  var n = L.normalizeImported({ taken: [{ slot: 'morning', day: 1, ts: 2 }, { slot: 'x', day: 1, ts: 2 }] });
  assert.strictEqual(n.taken.length, 1);
  console.log('prise faite : ok');
})();

/* Prise intermittente */
(function () {
  var assert = require('assert'), L = require('../logic.js');
  var t = function (y, m, dd) { return new Date(y, m, dd, 12).getTime(); };
  var mk = function (every, stockCount) {
    return L.newDrug({ id: 'i', name: 'Interm', slots: ['morning'], steps: [{ until: '', doses: { morning: 1 } }], every: every,
      stock: { count: stockCount == null ? 10 : stockCount, asOf: t(2026, 9, 1) } });
  };
  var d2 = mk({ n: 2, unit: 'days', from: '2026-10-01' });
  assert.ok(L.dueOn(d2, t(2026, 9, 1)) && !L.dueOn(d2, t(2026, 9, 2)) && L.dueOn(d2, t(2026, 9, 3)));
  assert.ok(!L.dueOn(d2, t(2026, 8, 29)));
  assert.strictEqual(L.dailyDose(d2, t(2026, 9, 2)), 0);
  assert.strictEqual(L.dailyDose(d2, t(2026, 9, 3)), 1);
  /* stock : prises les 3, 5, 7 -> consommées avant le 8 = 3 */
  assert.strictEqual(L.stockAt(d2, t(2026, 9, 8), null), 7);
  var w = mk({ n: 1, unit: 'weeks', from: '2026-10-01' });
  assert.ok(L.dueOn(w, t(2026, 9, 8)) && !L.dueOn(w, t(2026, 9, 9)));
  var m = mk({ n: 1, unit: 'months', from: '2026-01-31' });
  assert.ok(L.dueOn(m, t(2026, 1, 28)) && L.dueOn(m, t(2026, 2, 31)) && !L.dueOn(m, t(2026, 1, 27)));
  var y = mk({ n: 1, unit: 'years', from: '2025-10-16' });
  assert.ok(L.dueOn(y, t(2026, 9, 16)) && !L.dueOn(y, t(2026, 9, 17)));
  assert.strictEqual(L.posologyText(d2).slice(-16), 'tous les 2 jours');
  assert.strictEqual(L.cleanEvery({ n: 0, unit: 'days', from: '2026-10-01' }), null);
  var info = L.stockInfo(mk({ n: 2, unit: 'days', from: '2026-10-01' }, 10), t(2026, 9, 10), null);
  assert.strictEqual(info.remaining, 6);
  assert.strictEqual(info.daysLeft, 12);
  assert.strictEqual(L.normalizeImported({ drugs: [{ name: 'A', every: { n: 3, unit: 'weeks', from: '2026-10-01' } }, { name: 'B', every: { n: 3, unit: 'x' } }] }).drugs.map(function (z) { return !!z.every; }).join(), 'true,false');
  console.log('prise intermittente : ok');
})();

/* Prochaine prise */
(function () {
  var assert = require('assert'), L = require('../logic.js');
  var t = function (dd, h) { return new Date(2026, 9, dd, h || 12).getTime(); };
  var d = L.emptyData();
  var drug = L.newDrug({ id: 'n', name: 'N', slots: ['morning'], steps: [{ until: '', doses: { morning: 1 } }], every: { n: 2, unit: 'days', from: '2026-10-01' } });
  d.drugs.push(drug);
  assert.strictEqual(L.nextDose(drug, t(9), d), L.startOfDay(t(9)));
  L.markTaken(d, 'morning', t(9), t(9));
  assert.strictEqual(L.nextDose(drug, t(9), d), L.startOfDay(t(11)));
  assert.strictEqual(L.nextDose(drug, t(10), d), L.startOfDay(t(11)));
  assert.strictEqual(L.nextDose(L.newDrug({ name: 'x' }), t(9), d), null);
  console.log('prochaine prise : ok');
})();
