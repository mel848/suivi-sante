/* IA simulée de la démo : quelques maladies et médicaments connus, et un chat qui repère des mots-clés.
   Avec Gemini dans l'application réelle, la compréhension sera bien plus large. */
(function () {
  'use strict';
  var L = window.Logic;
  var N = L.normName;

  var DRUGS = {
    levothyrox: { name: 'Levothyrox', aliases: ['levothyrox', 'levothyroxine', 'euthyrox'], action: 'Hormone thyroïdienne', sideEffects: ['Palpitations', 'Tremblements', 'Insomnie', 'Nervosité', 'Sueurs', 'Maux de tête'], diseases: ['Hypothyroïdie'] },
    sertraline: { name: 'Sertraline', aliases: ['sertraline', 'zoloft'], action: 'Antidépresseur (ISRS)', sideEffects: ['Nausées', 'Diarrhée', 'Maux de tête', 'Insomnie', 'Somnolence', 'Sueurs', 'Fatigue', 'Vertiges', 'Bouche sèche'], diseases: ['Dépression', 'Trouble anxieux généralisé'] },
    esomeprazole: { name: 'Ésoméprazole', aliases: ['esomeprazole', 'inexium', 'omeprazole', 'mopral'], action: 'Anti-acide (inhibiteur de la pompe à protons)', sideEffects: ['Maux de tête', 'Diarrhée', 'Douleurs abdominales', 'Nausées', 'Constipation'], diseases: ['Reflux gastro-œsophagien'] },
    alprazolam: { name: 'Alprazolam', aliases: ['alprazolam', 'xanax'], action: 'Anxiolytique', sideEffects: ['Somnolence', 'Fatigue', 'Vertiges', 'Troubles de la mémoire', 'Maux de tête'], diseases: ['Trouble anxieux généralisé'] },
    melatonine: { name: 'Mélatonine', aliases: ['melatonine', 'circadin'], action: 'Aide au sommeil', sideEffects: ['Somnolence', 'Maux de tête', 'Vertiges', 'Nausées'], diseases: [] },
    ibuprofene: { name: 'Ibuprofène', aliases: ['ibuprofene', 'advil', 'nurofen', 'spedifen'], action: 'Anti-inflammatoire (AINS)', sideEffects: ['Nausées', 'Douleurs abdominales', 'Brûlures d’estomac', 'Diarrhée', 'Vertiges', 'Maux de tête'], diseases: ['Migraine chronique', 'Arthrose'] },
    doliprane: { name: 'Doliprane', aliases: ['doliprane', 'paracetamol', 'dafalgan', 'efferalgan'], action: 'Antidouleur et antifièvre', sideEffects: ['Éruption cutanée (rare)', 'Nausées (rare)'], diseases: ['Migraine chronique'] },
    sumatriptan: { name: 'Sumatriptan', aliases: ['sumatriptan', 'imigrane'], action: 'Antimigraineux (triptan)', sideEffects: ['Fatigue', 'Vertiges', 'Nausées', 'Somnolence', 'Sensation de lourdeur'], diseases: ['Migraine chronique'] },
    tramadol: { name: 'Tramadol', aliases: ['tramadol', 'contramal', 'topalgic'], action: 'Antidouleur (opioïde faible)', sideEffects: ['Nausées', 'Vertiges', 'Constipation', 'Somnolence', 'Maux de tête'], diseases: [] },
    spasfon: { name: 'Spasfon', aliases: ['spasfon', 'phloroglucinol'], action: 'Antispasmodique', sideEffects: ['Éruption cutanée (rare)'], diseases: [] },
    metformine: { name: 'Metformine', aliases: ['metformine', 'glucophage'], action: 'Antidiabétique', sideEffects: ['Nausées', 'Diarrhée', 'Douleurs abdominales', 'Goût métallique'], diseases: ['Diabète de type 2'] },
    amlodipine: { name: 'Amlodipine', aliases: ['amlodipine', 'amlor'], action: 'Antihypertenseur', sideEffects: ['Gonflement des chevilles', 'Maux de tête', 'Fatigue', 'Bouffées de chaleur'], diseases: ['Hypertension'] },
    salbutamol: { name: 'Salbutamol', aliases: ['salbutamol', 'ventoline'], action: 'Bronchodilatateur', sideEffects: ['Tremblements', 'Palpitations', 'Maux de tête'], diseases: ['Asthme'] }
  };

  var DISEASES = [
    { match: ['migraine'], symptoms: ['Maux de tête', 'Nausées', 'Sensibilité à la lumière', 'Sensibilité au bruit', 'Vertiges'], treatments: ['sumatriptan', 'ibuprofene', 'doliprane'] },
    { match: ['hypothyroidie', 'thyroide'], symptoms: ['Fatigue', 'Frilosité', 'Prise de poids', 'Constipation', 'Peau sèche'], treatments: ['levothyrox'] },
    { match: ['anxiete', 'anxieux', 'angoisse'], symptoms: ['Anxiété', 'Insomnie', 'Palpitations', 'Tension musculaire', 'Irritabilité'], treatments: ['sertraline', 'alprazolam'] },
    { match: ['reflux', 'rgo'], symptoms: ['Brûlures d’estomac', 'Remontées acides', 'Douleurs abdominales', 'Toux nocturne'], treatments: ['esomeprazole'] },
    { match: ['depression'], symptoms: ['Tristesse', 'Fatigue', 'Perte d’intérêt', 'Troubles du sommeil'], treatments: ['sertraline'] },
    { match: ['diabete'], symptoms: ['Soif excessive', 'Fatigue', 'Envie fréquente d’uriner', 'Vision floue'], treatments: ['metformine'] },
    { match: ['hypertension', 'tension'], symptoms: ['Maux de tête', 'Vertiges', 'Bourdonnements d’oreilles'], treatments: ['amlodipine'] },
    { match: ['asthme'], symptoms: ['Essoufflement', 'Toux', 'Sifflements', 'Oppression dans la poitrine'], treatments: ['salbutamol'] },
    { match: ['fibromyalgie'], symptoms: ['Douleurs diffuses', 'Fatigue', 'Troubles du sommeil', 'Raideur le matin'], treatments: ['tramadol'] },
    { match: ['arthrose'], symptoms: ['Douleurs articulaires', 'Raideur', 'Gonflement des articulations'], treatments: ['doliprane', 'ibuprofene'] }
  ];

  function findDrug(text) {
    var t = N(text);
    var keys = Object.keys(DRUGS);
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < DRUGS[keys[i]].aliases.length; j++) if (t.indexOf(DRUGS[keys[i]].aliases[j]) >= 0) return DRUGS[keys[i]];
    }
    return null;
  }

  /* ---------- Tâches de fiche ---------- */
  function diseaseInfo(user) {
    var t = N(user.replace(/^Maladie :/, ''));
    for (var i = 0; i < DISEASES.length; i++) {
      if (DISEASES[i].match.some(function (m) { return t.indexOf(m) >= 0; })) {
        return {
          symptoms: DISEASES[i].symptoms,
          treatments: DISEASES[i].treatments.map(function (k) { return { name: DRUGS[k].name, action: DRUGS[k].action }; })
        };
      }
    }
    return { symptoms: [], treatments: [] };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function drugInfo(user) {
    var d = findDrug(user.replace(/^Médicament :/, ''));
    return d ? { action: d.action, sideEffects: d.sideEffects, diseases: d.diseases } : { action: '', sideEffects: [], diseases: [] };
  }

  function advice(user, data, now) {
    var sym = user.replace(/^Symptôme :\s*/, '').replace(/\s*\(noté.*$/, '');
    var items = L.causesFor(data, sym, now, L.analyze(data, 6, now));
    if (!items.length) return { note: 'Je ne trouve pas de lien évident avec tes maladies ou tes traitements. Le sommeil, le stress ou l’alimentation peuvent jouer. Si ça revient souvent, parles-en à ton médecin.' };
    var txt = items.slice(0, 3).map(function (i) { return i.label; }).join(', ');
    return { note: 'Pour « ' + sym.toLowerCase() + ' », les pistes les plus probables dans ton carnet sont : ' + txt + '. Ce sont des pistes et pas un diagnostic. Si ça se répète, montre cette liste à ton médecin ou à ton pharmacien.' };
  }

  /* ---------- Chat ---------- */
  var SYMPTOMS = [
    [/(mal|maux) (a|de) la tete|migraine|cephalee/, 'Maux de tête'],
    [/nausee|envie de vomir|mal au coeur/, 'Nausées'],
    [/fatigue|epuise|creve/, 'Fatigue'],
    [/vertige|etourdi/, 'Vertiges'],
    [/mal au ventre|mal a l estomac|douleurs? (abdominale|d estomac)|maux de ventre/, 'Douleurs abdominales'],
    [/brulure.? d estomac|remontee.? acide/, 'Brûlures d’estomac'],
    [/insomnie|mal dormi|nuit blanche/, 'Insomnie'],
    [/palpitation/, 'Palpitations'],
    [/diarrhee/, 'Diarrhée'],
    [/anxiete|angoisse/, 'Anxiété'],
    [/saignement|spotting/, 'Saignements'],
    [/mal au dos|lombalgie/, 'Douleurs au dos']
  ];
  var MEDS = [
    [/doliprane|paracetamol|dafalgan/, 'Doliprane'],
    [/ibuprofene|advil|nurofen|spedifen/, 'Ibuprofène'],
    [/spasfon/, 'Spasfon']
  ];
  var SERIOUS = /douleur (dans|a) la poitrine|difficulte a respirer|malaise|paralysie|idees noires|suicid/;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function whenOf(t, now) {
    var m = /il y a (\d+)\s*(min|minute|minutes|h|heure|heures)\b/.exec(t);
    if (m) return iso(now - Number(m[1]) * (m[2].charAt(0) === 'm' ? 60000 : 3600000));
    if (/il y a une demi heure/.test(t)) return iso(now - 30 * 60000);
    if (/il y a une heure|il y a 1 heure/.test(t)) return iso(now - 3600000);
    m = /ce matin(?: vers (\d+) ?h)?/.exec(t);
    if (m) { var d = new Date(now); d.setHours(m[1] ? Number(m[1]) : 8, 0, 0, 0); if (d.getTime() < now) return iso(d.getTime()); }
    if (/hier soir/.test(t)) { var y = new Date(now); y.setDate(y.getDate() - 1); y.setHours(21, 0, 0, 0); return iso(y.getTime()); }
    return null;
  }

  function intensityOf(t) {
    var m = /(\d+)\s*(?:\/|sur)\s*10/.exec(t);
    if (m) return Math.min(10, Number(m[1]));
    return null;
  }


  var MONTHS = { janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11 };
  var MONTH_RE = '(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)';
  var WORDNUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

  function pastDate(day, monthName, yearStr, now) {
    var y = yearStr ? Number(yearStr) : new Date(now).getFullYear();
    var d = new Date(y, MONTHS[monthName], day, 9, 0, 0, 0);
    if (!yearStr && d.getTime() > now) d = new Date(y - 1, MONTHS[monthName], day, 9, 0, 0, 0);
    return d;
  }

  function addSpan(d, n, unit) {
    var e = new Date(d.getTime());
    if (unit.indexOf('mois') === 0) e.setMonth(e.getMonth() + n);
    else if (unit.indexOf('semaine') === 0) e.setDate(e.getDate() + 7 * n);
    else e.setDate(e.getDate() + n);
    return e;
  }

  /* Souvenir ancien sur plusieurs jours : « j'ai commencé la pilule le 3 mars, saignements pendant un mois » ou « mal au dos du 5 au 12 septembre » */
  var NOT_DRUG = /^(les|des|mes|mon|ma|premiere|fois|je|tu|il|elle|ont|ete|saignements?|spotting|mois|mars|avril|juin|juillet|janvier|fevrier|mai|aout|septembre|octobre|novembre|decembre|pour|que|qui|des|depuis|avoir|etre)$/;
  var QTY = '(un|une|deux|trois|quatre|cinq|six|sept|huit|dix|\\d+)';
  var UNIT = '(mois|semaines?|jours?)';

  function numOf(w) { var m = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10 }; return m[w] || Number(w); }

  var text0 = '';
  function pastPeriod(tt, symptoms, data, now) {
    if (!symptoms.length) return null;
    var start = null, end = null, drug = null;
    var r = new RegExp('du (\\d{1,2}|1er) (?:au|jusqu au) (\\d{1,2}|1er) ' + MONTH_RE).exec(tt);
    if (r) {
      start = pastDate(parseInt(r[1], 10), r[3], null, now);
      end = pastDate(parseInt(r[2], 10), r[3], null, now);
      end.setHours(12);
    } else {
      /* début du traitement */
      var c = /(?:commenc\w*|debut|pris|prendre|prise|demarre\w*)\s+(?:a prendre |de prendre |de |du |d |de la |de l |la |le |l |les |mon |ma |mes |ma toute premiere )*([a-z][a-z0-9]{2,})/.exec(tt);
      var nm = c && !NOT_DRUG.test(c[1]) ? c[1] : null;
      if (!nm && /pilule/.test(tt)) nm = 'pilule';
      if (nm) {
        var known = (data.drugs || []).filter(function (d) { return N(d.name) === nm; })[0];
        drug = known ? known.name : nm.charAt(0).toUpperCase() + nm.slice(1);
      }
      /* date de début : « il y a » est retiré avant de chercher la durée */
      var ago = new RegExp('il y a ' + QTY + ' ' + UNIT).exec(tt);
      var rest = ago ? tt.replace(ago[0], ' ') : tt;
      var sd = new RegExp('(\\d{1,2}|1er) ' + MONTH_RE + '(?: (\\d{4}))?').exec(tt);
      var sn = /(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/.exec(text0);
      var sm = new RegExp('(?:debut|en|courant|fin|mi) ' + MONTH_RE).exec(tt);
      if (sd) start = pastDate(parseInt(sd[1], 10), sd[2], sd[3], now);
      else if (sn && Number(sn[2]) >= 1 && Number(sn[2]) <= 12) {
        var yy = sn[3] ? Number(sn[3]) : null; if (yy != null && yy < 100) yy += 2000;
        start = pastDate(Number(sn[1]), Object.keys(MONTHS)[Number(sn[2]) - 1], yy, now);
      } else if (sm) start = pastDate(1, sm[1], null, now);
      else if (ago) start = addSpan(new Date(now), -numOf(ago[1]), ago[2]);
      var du = new RegExp(QTY + ' ' + UNIT).exec(rest);
      if (!start || !du) return null;
      end = addSpan(start, numOf(du[1]), du[2]);
    }
    if (!start || !end || end <= start) return null;
    if (end.getTime() > now) end = new Date(now);
    return { start: start, end: end, drug: drug, mode: /par moments|intermittent|de temps en temps|par intermittence/.test(tt) ? 'intermittent' : 'continuous' };
  }

  function fmtD(d) { return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); }

  function causesSentence(data, name, now, analysis) {
    var items = L.causesFor(data, name, now, analysis);
    if (!items.length) return '';
    var parts = [];
    var dis = items.filter(function (i) { return i.kind === 'disease'; });
    var drg = items.filter(function (i) { return i.kind !== 'disease'; });
    if (dis.length) parts.push('c’est un symptôme connu de ' + dis.map(function (i) { return 'ta ' + i.label.toLowerCase(); }).join(' et de ').replace('ta trouble', 'ton trouble').replace('ta reflux', 'ton reflux'));
    if (drg.length) parts.push('ça peut aussi être un effet indésirable de ' + drg.slice(0, 2).map(function (i) { return i.label; }).join(' ou de '));
    return name + ' : ' + parts.join(', et ') + '. Ce sont des pistes à confirmer avec ton médecin, pas un diagnostic.';
  }

  function chat(system, contents, data, now) {
    var last = contents[contents.length - 1].parts[0].text;
    var t = N(last);
    var prevAi = contents.length >= 2 ? contents[contents.length - 2].parts[0].text : '';
    var prevUser = contents.length >= 3 ? contents[contents.length - 3].parts[0].text : '';
    var asked = /de 0 a 10/.test(N(prevAi));
    var text = asked ? prevUser + ' ' + last : last;
    var tt = N(text);

    if (SERIOUS.test(tt)) return { reply: 'Ce que tu décris peut être sérieux. Appelle tout de suite le 15 (ou le 112) pour être conseillé.', events: [] };

    var symptoms = [], meds = [];
    SYMPTOMS.forEach(function (s) { if (s[0].test(tt)) symptoms.push(s[1]); });
    MEDS.forEach(function (m) { if (m[0].test(tt)) meds.push(m[1]); });
    var analysis = L.analyze(data, 6, now);

    text0 = String(text).toLowerCase();
    var pp = !asked ? pastPeriod(tt, symptoms, data, now) : null;
    if (pp) {
      var evs = [], rep = [];
      if (pp.drug) {
        evs.push({ type: 'treatment', name: pp.drug, detail: 'Début', when: iso(pp.start.getTime()) });
        rep.push('le début de ' + pp.drug.toLowerCase() + ' le ' + fmtD(pp.start));
      }
      evs.push({ type: 'symptom', name: symptoms[0], intensity: null, until: L.ymd(pp.end.getTime()), mode: pp.mode, when: iso(pp.start.getTime()) });
      rep.push(symptoms[0].toLowerCase() + ' du ' + fmtD(pp.start) + ' au ' + fmtD(pp.end) + ' (' + L.spanText(pp.start.getTime(), pp.end.getTime()) + ', ' + (pp.mode === 'intermittent' ? 'par moments' : 'en continu') + ')');
      return { reply: 'Je te propose : ' + rep.join(', puis ') + '. Pas besoin d’intensité pour un souvenir ancien. Vérifie les dates puis enregistre.', events: evs };
    }

    if (!asked && symptoms.length && (/arret|termine|fini|stoppe|disparu|cesse|au bout|dure|duree/.test(tt) || (/pendant|apres/.test(tt) && /mois|semaines|jours/.test(tt))) && !/il y a (une|\d+) ?(h|heure|min)/.test(tt)) {
      return { reply: 'Je veux bien noter ça comme un souvenir ancien. À partir de quelle date (par exemple « le 3 mars ») et pendant combien de temps ? Je n’ai pas besoin de l’intensité.', events: [] };
    }

    /* Question sur le carnet */
    if (!asked && (/\?/.test(last) || /^(pourquoi|est ce|d ou|quel|quelle|mes )/.test(t)) && (symptoms.length || meds.length)) {
      if (symptoms.length && meds.length) {
        var r = analysis.filter(function (a) { return N(a.med) === N(meds[0]); })[0];
        var row = r && r.rows.filter(function (x) { return L.sameSymptom(x.symptom, symptoms[0]); })[0];
        if (r && row && row.eligible) {
          return { reply: symptoms[0] + ' est apparu après ' + row.newAfter + ' prise(s) de ' + r.med.toLowerCase() + ' sur ' + row.eligible + (row.baseline != null ? ', alors qu’en temps normal il revient environ ' + Math.round(row.baseline * 100) + ' % du temps' : '') + '. C’est une coïncidence dans ton carnet, pas une preuve : parles-en à ton médecin ou à ton pharmacien.', events: [] };
        }
        return { reply: 'Je n’ai pas assez de prises de ' + meds[0].toLowerCase() + ' dans ton carnet pour comparer.', events: [] };
      }
      if (symptoms.length) {
        var s = causesSentence(data, symptoms[0], now, analysis);
        return { reply: s || 'Je ne trouve pas de lien avec tes maladies ou tes traitements pour ' + symptoms[0].toLowerCase() + '.', events: [] };
      }
    }

    var events = [], reply = [];
    var when = whenOf(tt, now);
    var dur = /depuis (ce matin|hier|une heure|\d+ ?(?:h|heures?|min|minutes?|jours?))/.exec(tt);

    /* Passage à la pharmacie */
    if (/pharmacie/.test(tt)) {
      var q = /trimestr|3 mois|90 jours/.test(tt);
      events.push({ type: 'pharmacy', name: 'Passage à la pharmacie', detail: q ? 'trimestrielle' : 'mensuelle', when: when });
      reply.push('Je te propose d’enregistrer ton passage à la pharmacie (ordonnance ' + (q ? 'trimestrielle' : 'mensuelle') + '). Le rappel de renouvellement sera calculé pour toi.');
    }

    /* Changement de traitement de fond */
    var known = (data.drugs || []).filter(function (d) { return tt.indexOf(N(d.name)) >= 0; })[0];
    if (known && /commenc|arret|stop|augment|baiss|reduit|passe a|passage a|nouvelle dose/.test(tt)) {
      var how = /arret|stop/.test(tt) ? 'arrêt' : /commenc/.test(tt) ? 'début' : 'dose modifiée';
      events.push({ type: 'treatment', name: known.name, detail: last.trim(), when: when });
      reply.push('Changement de traitement noté pour ' + known.name + ' (' + how + ').');
    }

    meds.forEach(function (m) {
      var dm = /(\d+(?:[.,]\d+)?)\s*(g|mg|comprime|comprimes|cp|gelule|gelules)\b/.exec(tt);
      events.push({ type: 'medication', name: m, qty: dm && (dm[2].indexOf('comp') === 0 || dm[2] === 'cp' || dm[2].indexOf('gel') === 0) ? Number(dm[1].replace(',', '.')) : null, dose: dm ? dm[1].replace(',', '.') + ' ' + (dm[2].indexOf('comp') === 0 || dm[2] === 'cp' ? (Number(dm[1]) > 1 ? 'comprimés' : 'comprimé') : dm[2].indexOf('gel') === 0 ? 'gélule' : dm[2]) : null, detail: null, when: when });
    });

    var askAbout = null;
    symptoms.forEach(function (sname) {
      var inten = intensityOf(tt);
      if (inten == null && asked && /^\s*\d+\s*$/.test(last)) inten = Math.min(10, Number(last));
      var unknown = asked && /(sais pas|aucune idee|je ne sais)/.test(t);
      if (inten == null && !unknown && !askAbout) { askAbout = sname; return; }
      if (inten == null && !unknown) return;
      events.push({ type: 'symptom', name: sname, intensity: inten, duration: dur ? dur[1].trim() : null, detail: null, when: when });
      var cs = causesSentence(data, sname, now, analysis);
      if (cs) reply.push(cs);
    });

    if (askAbout) {
      return { reply: 'Quelle est l’intensité de ' + (askAbout === 'Maux de tête' ? 'tes maux de tête' : askAbout === 'Nausées' ? 'tes nausées' : askAbout === 'Fatigue' ? 'ta fatigue' : askAbout === 'Vertiges' ? 'tes vertiges' : askAbout === 'Saignements' ? 'tes saignements' : askAbout.toLowerCase()) + ', de 0 à 10 ?', events: events.filter(function (e) { return e.type !== 'symptom'; }) };
    }

    if (!events.length && /^(note|rappel)\b|mauvaise nuit|stress|rendez vous|rdv/.test(tt)) {
      events.push({ type: 'note', name: /stress/.test(tt) ? 'Stress' : /rendez vous|rdv/.test(tt) ? 'Rendez-vous' : 'Note', detail: last.trim(), when: when });
      reply.push('Je note ça.');
    }

    if (!events.length) {
      return { reply: 'Dans cette démo, je ne comprends que quelques mots-clés (maux de tête, nausées, fatigue, Doliprane, ibuprofène, pharmacie…). Essaie : « migraine 7/10 depuis 1 h, pris 1 g de Doliprane il y a 30 minutes ». Avec Gemini, je comprendrai bien plus de choses.', events: [] };
    }
    if (events.length && !reply.length) reply.push('Voilà ce que j’ai compris.');
    reply.push('Vérifie puis enregistre.');
    return { reply: reply.join(' '), events: events };
  }

  window.DemoKB = { drugs: DRUGS };
  window.DemoAI = {
    answer: function (system, contents, data, now) {
      var user = contents.length ? contents[contents.length - 1].parts[0].text : '';
      if (/^Tâche : fiche maladie/.test(system)) return diseaseInfo(user);
      if (/^Tâche : fiche médicament/.test(system)) return drugInfo(user);
      if (/^Tâche : avis sur un symptôme/.test(system)) return advice(user, data, now);
      return chat(system, contents, data, now);
    }
  };
})();
