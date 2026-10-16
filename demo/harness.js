/* Démo : tout ce qui n'existe pas dans l'application réelle.
   - stockage en mémoire (rien n'est conservé)
   - données d'exemple fictives
   - IA simulée (remplace Google Gemini : comprend seulement quelques mots-clés)
   - notifications simulées dans la page */
(function () {
  'use strict';
  var L = window.Logic;

  /* ---------- Stockage en mémoire ---------- */
  var mem = {};
  var fake = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; }
  };
  try { Object.defineProperty(window, 'localStorage', { value: fake, configurable: true }); } catch (e) { /* le stockage réel sera utilisé */ }
  var store = window.localStorage;

  /* ---------- Données d'exemple ---------- */
  var now = Date.now();
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rand = rng(20261012);
  function at(daysAgo, h, m) { var d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m || 0, 0, 0); return Math.min(d.getTime(), now - 5 * 60000); }
  function pick(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  var id = 0; function nid(p) { return p + (++id); }

  var D = L.emptyData();
  var KB_DRUGS = window.DemoKB.drugs;

  /* Maladies (fictives) */
  D.diseases = [
    { id: 'm-mig', name: 'Migraine chronique', diagnosed: '2019-03-14', symptoms: ['Maux de tête', 'Nausées', 'Sensibilité à la lumière'], note: 'Suivie par le neurologue.' },
    { id: 'm-thy', name: 'Hypothyroïdie', diagnosed: '2016-09-02', symptoms: ['Fatigue', 'Frilosité', 'Constipation'], note: '' },
    { id: 'm-anx', name: 'Trouble anxieux généralisé', diagnosed: '2022-01-20', symptoms: ['Anxiété', 'Insomnie', 'Palpitations'], note: '' },
    { id: 'm-gerd', name: 'Reflux gastro-œsophagien', diagnosed: '2021-06-08', symptoms: ['Brûlures d’estomac', 'Remontées acides'], note: '' }
  ];

  function drug(p) { return L.newDrug(p); }
  D.drugs = [
    drug({ id: 'd-levo', name: 'Levothyrox', strength: '75 µg', action: 'Hormone thyroïdienne', diseaseIds: ['m-thy'], slots: ['morning'],
      steps: [{ until: '', doses: { morning: 1 } }], stock: { count: 90, asOf: at(40, 11) }, sideEffects: KB_DRUGS.levothyrox.sideEffects }),
    drug({ id: 'd-sert', name: 'Sertraline', strength: '50 mg', action: 'Antidépresseur (ISRS)', diseaseIds: ['m-anx'], slots: ['morning'],
      steps: [{ until: L.ymd(at(6, 12)), doses: { morning: 0.5 } }, { until: L.ymd(at(-9, 12)), doses: { morning: 1 } }, { until: '', doses: { morning: 1.5 } }],
      stock: { count: 28, asOf: at(8, 11) }, sideEffects: KB_DRUGS.sertraline.sideEffects, note: 'Augmentation progressive prescrite par le médecin.' }),
    drug({ id: 'd-eso', name: 'Ésoméprazole', strength: '20 mg', action: 'Anti-acide (inhibiteur de la pompe à protons)', diseaseIds: ['m-gerd'], slots: ['morning'],
      steps: [{ until: '', doses: { morning: 1 } }], stock: { count: 28, asOf: at(8, 11) }, sideEffects: KB_DRUGS.esomeprazole.sideEffects }),
    drug({ id: 'd-alp', name: 'Alprazolam', strength: '0,25 mg', action: 'Anxiolytique', diseaseIds: ['m-anx'], slots: ['evening'],
      steps: [{ until: '', doses: { evening: 1 } }], stock: { count: 30, asOf: at(8, 11) }, sideEffects: KB_DRUGS.alprazolam.sideEffects }),
    drug({ id: 'd-mel', name: 'Mélatonine', strength: '1 mg', action: 'Aide au sommeil', diseaseIds: [], slots: ['evening'],
      steps: [{ until: '', doses: { evening: 1 } }], stock: { count: 10, asOf: at(8, 11) }, sideEffects: KB_DRUGS.melatonine.sideEffects }),
    drug({ id: 'd-dol', name: 'Doliprane', strength: '1 g', action: 'Antidouleur', diseaseIds: ['m-mig'], slots: [], steps: [{ until: '', doses: {} }], stock: { count: 16, asOf: at(20, 11) }, sideEffects: KB_DRUGS.doliprane.sideEffects })
  ];
  D.medInfo = {
    ibuprofene: { action: KB_DRUGS.ibuprofene.action, sideEffects: KB_DRUGS.ibuprofene.sideEffects },
    doliprane: { action: KB_DRUGS.doliprane.action, sideEffects: KB_DRUGS.doliprane.sideEffects }
  };
  D.slots.morning.notify = true; D.slots.morning.time = '08:00'; D.slots.morning.sound = 'carillon';
  D.slots.evening.notify = true; D.slots.evening.time = '20:30'; D.slots.evening.mode = 'silent';

  /* Maux de tête (15) : 8 fois ibuprofène, 7 fois Doliprane */
  var headDays = [43, 40, 37, 34, 31, 28, 25, 22, 19, 16, 13, 10, 7, 4, 1];
  var ibuCount = 0;
  headDays.forEach(function (day, i) {
    var h = pick(9, 11), m = pick(0, 50);
    D.symptoms.push({ id: nid('s'), name: 'Maux de tête', ts: at(day, h, m), intensity: pick(5, 8), duration: '2 h', note: '' });
    var tsMed = at(day, h, m) + 20 * 60000;
    if (i % 2 === 0) {
      D.meds.push({ id: nid('m'), name: 'Ibuprofène', ts: tsMed, dose: '400 mg', note: 'pour la migraine' });
      if ([0, 1, 3, 4, 6, 7].indexOf(ibuCount) >= 0) {
        D.symptoms.push({ id: nid('s'), name: 'Nausées', ts: tsMed + pick(60, 150) * 60000, intensity: pick(3, 5), duration: '1 h', note: '' });
      }
      ibuCount++;
    } else {
      D.meds.push({ id: nid('m'), name: 'Doliprane', ts: tsMed, dose: '1 g', note: 'pour la migraine' });
    }
  });
  [38, 26, 15].forEach(function (day) { D.symptoms.push({ id: nid('s'), name: 'Nausées', ts: at(day, 17, 10), intensity: 3, duration: '', note: '' }); });
  for (var day = 44; day >= 1; day--) {
    if (rand() < 0.5) D.symptoms.push({ id: nid('s'), name: 'Fatigue', ts: at(day, pick(19, 21), pick(0, 50)), intensity: pick(3, 6), duration: '', note: '' });
  }
  [33, 21, 9, 3].forEach(function (day) { D.symptoms.push({ id: nid('s'), name: 'Insomnie', ts: at(day, 7, 30), intensity: 5, duration: '', note: 'réveillé plusieurs fois' }); });
  [29, 18, 6].forEach(function (day) { D.symptoms.push({ id: nid('s'), name: 'Brûlures d’estomac', ts: at(day, 21, 10), intensity: 4, duration: '1 h', note: 'après le repas' }); });
  [2].forEach(function (day) { D.symptoms.push({ id: nid('s'), name: 'Vertiges', ts: at(day, 11, 0), intensity: 3, duration: '', note: '' }); });

  /* Notes, changements de traitement, pharmacie */
  D.notes.push({ id: nid('n'), name: 'Mauvaise nuit', ts: at(33, 7, 40), text: 'Réveillé trois fois.' });
  D.notes.push({ id: nid('n'), name: 'Rendez-vous médecin', ts: at(14, 16, 0), text: 'Début de la sertraline à petite dose.' });
  D.notes.push({ id: nid('n'), name: 'Stress au travail', ts: at(9, 18, 0), text: 'Semaine chargée.' });
  D.changes.push({ id: nid('c'), name: 'Ésoméprazole', ts: at(40, 9, 0), how: 'Début', detail: '20 mg le matin' });
  D.changes.push({ id: nid('c'), name: 'Sertraline', ts: at(14, 17, 0), how: 'Début', detail: '25 mg par jour (0,5 comprimé)' });
  D.changes.push({ id: nid('c'), name: 'Sertraline', ts: at(5, 9, 0), how: 'Dose modifiée', detail: 'de 25 mg à 50 mg par jour' });
  D.pharmacy.push({ id: nid('p'), name: 'Passage à la pharmacie', ts: at(40, 11, 0), rx: 'quarterly', items: [{ drugId: 'd-levo', name: 'Levothyrox', qty: 90 }], note: '' });
  D.pharmacy.push({ id: nid('p'), name: 'Passage à la pharmacie', ts: at(8, 11, 0), rx: 'monthly', items: [{ drugId: 'd-sert', name: 'Sertraline', qty: 28 }, { drugId: 'd-eso', name: 'Ésoméprazole', qty: 28 }, { drugId: 'd-alp', name: 'Alprazolam', qty: 30 }], note: '' });

  L.updateCauses(D, now, 6);
  store.setItem('suivi-sante-v1', JSON.stringify(D));
  store.setItem('suivi-sante-apikey', 'CLE-FICTIVE-DE-DEMONSTRATION');

  /* ---------- Notifications simulées ---------- */
  window.SuiviNotif = {
    show: function (n, play) {
      var el = document.getElementById('demo-notif');
      el.querySelector('.t').textContent = n.title;
      el.querySelector('.b').textContent = n.body;
      el.querySelector('.m').textContent = n.mode === 'sound' ? '🔔 avec son' : '🔕 silencieux';
      el.classList.add('show');
      clearTimeout(window.__nt);
      window.__nt = setTimeout(function () { el.classList.remove('show'); }, 5000);
      var act = el.querySelector('.acts');
      act.textContent = '';
      if (n.kind === 'slot' && n.extra) {
        [['fait', 'Fait'], ['reporter', 'Reporter']].forEach(function (a) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = a[1]; b.setAttribute('data-act', a[0]);
          b.addEventListener('click', function () { el.classList.remove('show'); clearTimeout(window.__nt); window.__suiviNotifAction(a[0], n.extra); });
          act.appendChild(b);
        });
        clearTimeout(window.__nt); window.__nt = setTimeout(function () { el.classList.remove('show'); }, 12000);
      }
      if (n.mode === 'sound') play(n.sound);
    },
    snooze: function (extra, minutes) { /* dans l'APK : le rappel est reprogrammé par Android */ },
    cancelKey: function () { /* dans l'APK : annule les rappels en attente */ },
    schedule: function () { /* dans l'APK : programmation réelle */ },
    diagnose: function () {
      var t = Date.now();
      return Promise.resolve({ perm: window.__demoPerm || 'granted', exact: 'granted', err: '', pending: [{ at: t + 3600000, title: 'Prise du soir' }, { at: t + 86400000, title: 'Prise du matin' }] });
    },
    askPermission: function () { window.__demoPerm = 'granted'; return Promise.resolve('granted'); },
    askExact: function () { return Promise.resolve(); }
  };

  /* ---------- IA simulée : remplace l'appel à Google Gemini ---------- */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function gemini(obj) {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  window.fetch = function (url, opts) {
    if (String(url).indexOf('generativelanguage.googleapis.com') < 0) return realFetch ? realFetch(url, opts) : Promise.reject(new Error('offline'));
    var body = JSON.parse(opts.body);
    var system = body.systemInstruction.parts[0].text;
    var contents = body.contents || [];
    var delay = 500 + Math.random() * 500;
    return new Promise(function (resolve) {
      setTimeout(function () {
        var data = L.normalizeImported(JSON.parse(store.getItem('suivi-sante-v1')));
        resolve(gemini(window.DemoAI.answer(system, contents, data, Date.now())));
      }, delay);
    });
  };
})();
