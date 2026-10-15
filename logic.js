/* Logique pure (sans interface) : données, calendrier, analyse, lecture des réponses IA.
   Fonctionne dans le navigateur (window.Logic) et dans Node (pour les tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOUR = 3600 * 1000;

  /* Types d'entrées : clé interne -> nom du tableau dans les données */
  var KINDS = ['symptom', 'medication', 'treatment', 'pharmacy', 'note'];
  var ARRAY_OF = { symptom: 'symptoms', medication: 'meds', treatment: 'changes', pharmacy: 'pharmacy', note: 'notes' };
  var DAYMS = 24 * 3600 * 1000;

  /* ---------- Utilitaires ---------- */

  function normName(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function startOfDay(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* Format "YYYY-MM-DDTHH:MM" en heure locale (pour <input type="datetime-local">) */
  function toLocalInput(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  /* Date lisible pour l'IA : "2026-10-12 00:51 (lundi)" */
  function toPromptNow(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' (' + JOURS[d.getDay()] + ')';
  }

  /* Libellé d'affichage le plus fréquent pour chaque nom normalisé */
  function displayNames(items) {
    var counts = {};
    items.forEach(function (it) {
      var k = normName(it.name);
      if (!k) return;
      counts[k] = counts[k] || {};
      counts[k][it.name] = (counts[k][it.name] || 0) + 1;
    });
    var out = {};
    Object.keys(counts).forEach(function (k) {
      var best = null, bestN = -1;
      Object.keys(counts[k]).forEach(function (label) {
        if (counts[k][label] > bestN) { best = label; bestN = counts[k][label]; }
      });
      out[k] = best;
    });
    return out;
  }

  /* Noms les plus utilisés (pour les boutons de saisie rapide), du plus fréquent au moins fréquent */
  function topNames(items, limit) {
    var counts = {};
    var labels = displayNames(items);
    items.forEach(function (it) {
      var k = normName(it.name);
      if (!k) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, limit || 8)
      .map(function (k) { return labels[k]; });
  }

  /* ---------- Calendrier ---------- */

  /* Cases d'un mois (semaines complètes, lundi en premier). month : 0 à 11.
     Chaque case : { ts (minuit local), day, inMonth } */
  function monthGrid(year, month) {
    var offset = (new Date(year, month, 1).getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var weeks = Math.ceil((offset + daysInMonth) / 7);
    var cells = [];
    for (var i = 0; i < weeks * 7; i++) {
      var d = new Date(year, month, 1 - offset + i);
      cells.push({ ts: d.getTime(), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    return cells;
  }

  /* Un symptôme peut couvrir plusieurs jours : endTs = fin de la période (jour inclus) */
  function isPeriod(kind, it) {
    return kind === 'symptom' && !!it.endTs && it.endTs > it.ts && startOfDay(it.endTs) > startOfDay(it.ts);
  }

  /* "≈ 1 mois", "12 jours", "3 semaines" */
  function spanText(ts, endTs) {
    var days = dayDiff(endTs, ts) + 1;
    if (days >= 45) { var m = Math.round(days / 30.4); return '≈ ' + m + ' mois'; }
    if (days >= 27) return '≈ 1 mois';
    if (days >= 14 && days % 7 === 0) return (days / 7) + ' semaines';
    return days + (days > 1 ? ' jours' : ' jour');
  }

  /* Le début de ce traitement est-il déjà noté ? */
  function hasStart(data, name) {
    var k = normName(name);
    return (data.changes || []).some(function (c) { return normName(c.name) === k && c.how === 'Début'; });
  }

  function emptyCounts() {
    var c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    return c;
  }

  /* Regroupe toutes les entrées par jour : { [minuit]: { counts:{symptom,...}, items:[{kind,it}] } } */
  function entriesByDay(data) {
    var map = {};
    KINDS.forEach(function (kind) {
      (data[ARRAY_OF[kind]] || []).forEach(function (it) {
        var first = startOfDay(it.ts);
        var last = isPeriod(kind, it) ? Math.min(startOfDay(it.endTs), addDays(first, 400)) : first;
        var total = dayDiff(last, first) + 1;
        for (var k = first, i = 0; k <= last; k = addDays(k, 1), i++) {
          var e = map[k] || (map[k] = { counts: emptyCounts(), items: [] });
          e.counts[kind]++;
          e.items.push({ kind: kind, it: it, span: total > 1 ? { index: i, total: total, first: i === 0, last: k === last } : null });
        }
      });
    });
    Object.keys(map).forEach(function (k) {
      map[k].items.sort(function (a, b) { return a.it.ts - b.it.ts; });
    });
    return map;
  }

  /* ---------- Recherche dichotomique dans une liste triée ---------- */

  /* Y a-t-il une valeur v avec lo < v <= hi ? (arr trié croissant) */
  function hasIn(arr, lo, hi) {
    var a = 0, b = arr.length;
    while (a < b) {
      var m = (a + b) >> 1;
      if (arr[m] <= lo) a = m + 1; else b = m;
    }
    return a < arr.length && arr[a] <= hi;
  }

  /* ---------- Analyse « symptôme après prise » ---------- */
  /*
    Pour chaque médicament pris occasionnellement :
      - on regarde, pour chaque prise dont la fenêtre est terminée, quels symptômes sont notés
        dans les W heures SUIVANTES ;
      - on écarte les symptômes déjà notés dans les W heures AVANT la prise
        (souvent, c'est justement la raison de la prise) ;
      - on compare à la fréquence « de base » du même symptôme, calculée de la même façon
        sur toutes les périodes de W heures de ton suivi.
  */
  function analyze(data, windowHours, now) {
    var W = windowHours * HOUR;
    now = now || Date.now();
    var symptoms = data.symptoms || [];
    var meds = data.meds || [];

    var symLabels = displayNames(symptoms);
    var medLabels = displayNames(meds);

    var symTimes = {};
    symptoms.forEach(function (s) {
      var k = normName(s.name);
      if (!k) return;
      (symTimes[k] = symTimes[k] || []).push(s.ts);
    });
    Object.keys(symTimes).forEach(function (k) { symTimes[k].sort(function (a, b) { return a - b; }); });

    var all = symptoms.concat(meds).concat(data.changes || []);
    var start = all.length ? Math.min.apply(null, all.map(function (x) { return x.ts; })) : now;

    /* Fréquence de base : parmi les instants s où le symptôme n'était pas présent dans les W heures
       précédentes, part de ceux où il apparaît dans les W heures suivantes. */
    var baselineCache = {};
    function baseline(k) {
      if (k in baselineCache) return baselineCache[k];
      var times = symTimes[k];
      var from = start + W, to = now - W;
      var eligible = 0, hit = 0;
      for (var s = from; s <= to; s += HOUR) {
        if (hasIn(times, s - W - 1, s)) continue; // déjà présent juste avant
        eligible++;
        if (hasIn(times, s, s + W)) hit++;
      }
      var res = eligible >= 24 ? { p: hit / eligible, n: eligible } : null;
      baselineCache[k] = res;
      return res;
    }

    var byMed = {};
    meds.forEach(function (m) {
      var k = normName(m.name);
      if (!k) return;
      (byMed[k] = byMed[k] || []).push(m);
    });

    var result = Object.keys(byMed).map(function (mk) {
      var intakes = byMed[mk].filter(function (m) { return m.ts + W <= now; });
      var pending = byMed[mk].length - intakes.length;
      var perSym = {};
      intakes.forEach(function (m) {
        Object.keys(symTimes).forEach(function (sk) {
          var times = symTimes[sk];
          var after = hasIn(times, m.ts, m.ts + W);
          var before = hasIn(times, m.ts - W - 1, m.ts);
          var e = perSym[sk] = perSym[sk] || { after: 0, before: 0, newAfter: 0, eligible: 0 };
          if (before) e.before++;
          else {
            e.eligible++;
            if (after) e.newAfter++;
          }
          if (after) e.after++;
        });
      });

      var rows = Object.keys(perSym)
        .filter(function (sk) { return perSym[sk].after > 0; })
        .map(function (sk) {
          var e = perSym[sk];
          var b = baseline(sk);
          var pctNew = e.eligible ? e.newAfter / e.eligible : null;
          var ratio = (b && b.p > 0 && pctNew != null) ? pctNew / b.p : null;
          return {
            symptom: symLabels[sk],
            after: e.after,
            alreadyBefore: e.before,
            newAfter: e.newAfter,
            eligible: e.eligible,
            pctNew: pctNew,
            baseline: b ? b.p : null,
            ratio: ratio
          };
        })
        .sort(function (a, b) {
          return (b.newAfter - a.newAfter) || ((b.ratio || 0) - (a.ratio || 0));
        });

      var times = byMed[mk].map(function (m) { return m.ts; }).sort(function (a, b) { return a - b; });
      return {
        med: medLabels[mk],
        total: byMed[mk].length,
        analysed: intakes.length,
        pending: pending,
        first: times[0],
        last: times[times.length - 1],
        perWeek: frequencyPerWeek(times, now),
        enough: intakes.length >= 3,
        rows: rows
      };
    });

    result.sort(function (a, b) { return b.total - a.total; });
    return result;
  }

  function frequencyPerWeek(times, now) {
    if (!times.length) return 0;
    var spanDays = Math.max(7, (now - times[0]) / (24 * HOUR));
    return times.length / (spanDays / 7);
  }

  /* Phrase d'interprétation prudente pour une ligne de résultat */
  function verdict(row, enough) {
    if (!enough) return { level: 'low', text: 'Pas encore assez de prises pour conclure (il en faut au moins 3).' };
    if (row.newAfter < 2) return { level: 'low', text: 'Vu trop peu de fois pour en tirer quelque chose.' };
    if (row.ratio == null) return { level: 'low', text: 'Pas assez de données pour comparer à ta fréquence habituelle.' };
    if (row.ratio >= 2 && row.pctNew >= 0.3) return { level: 'high', text: 'Revient nettement plus souvent après la prise que d’habitude. À signaler à ton médecin ou pharmacien.' };
    if (row.ratio >= 1.5) return { level: 'mid', text: 'Un peu plus fréquent après la prise que d’habitude. À surveiller.' };
    return { level: 'low', text: 'Pas plus fréquent qu’en temps normal.' };
  }

  /* Résumé de l'analyse en quelques lignes, pour donner du contexte à l'IA */
  function analysisDigest(data, windowHours, now) {
    var res = analyze(data, windowHours, now);
    if (!res.length) return 'Aucun médicament occasionnel noté pour le moment.';
    return res.map(function (r) {
      if (!r.enough) return r.med + ' : ' + r.total + ' prise(s), pas encore assez pour comparer.';
      var rows = r.rows.filter(function (x) { return x.newAfter >= 2; }).slice(0, 3).map(function (x) {
        return x.symptom + ' apparu après ' + x.newAfter + ' prises sur ' + x.eligible +
          (x.baseline != null ? ' (habituellement ' + Math.round(x.baseline * 100) + ' % du temps)' : '');
      });
      return r.med + ' : ' + r.total + ' prises, ' + (rows.length ? rows.join(' ; ') : 'aucun symptôme récurrent après la prise') + '.';
    }).join('\n');
  }

  /* ---------- Lecture des réponses de l'IA ---------- */

  var TYPES = { symptom: 1, medication: 1, treatment: 1, pharmacy: 1, note: 1 };

  function extractJSON(raw) {
    var txt = String(raw == null ? '' : raw).trim();
    txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(txt); } catch (e) {
      var i = txt.indexOf('{'), j = txt.lastIndexOf('}');
      if (i >= 0 && j > i) {
        try { return JSON.parse(txt.slice(i, j + 1)); } catch (e2) { return undefined; }
      }
      return undefined;
    }
  }

  function cleanEvents(list, now) {
    var out = [];
    (list || []).forEach(function (ev) {
      if (!ev || !TYPES[ev.type]) return;
      var name = String(ev.name == null ? '' : ev.name).trim();
      if (ev.type === 'pharmacy' && !name) name = 'Passage à la pharmacie';
      if (!name) return;
      var ts = now;
      if (ev.when) {
        var t = Date.parse(ev.when);
        /* on refuse une date invalide ou située dans le futur */
        if (!isNaN(t) && t <= now + 5 * 60 * 1000) ts = t;
      }
      var inten = null;
      if (ev.type === 'symptom' && ev.intensity != null && ev.intensity !== '') {
        var n = Number(ev.intensity);
        if (isFinite(n)) inten = Math.max(0, Math.min(10, Math.round(n)));
      }
      var endTs = null, mode = null;
      if (ev.type === 'symptom' && ev.until) {
        var e = /^\d{4}-\d{2}-\d{2}$/.test(String(ev.until).trim()) ? atTime(parseYmd(String(ev.until).trim()), '23:59') : Date.parse(ev.until);
        if (!isNaN(e) && e > ts && startOfDay(e) > startOfDay(ts)) {
          endTs = Math.min(e, now);
          mode = ev.mode === 'intermittent' ? 'intermittent' : 'continuous';
          if (startOfDay(endTs) <= startOfDay(ts)) { endTs = null; mode = null; }
        }
      }
      out.push({
        type: ev.type,
        name: name,
        endTs: endTs,
        mode: mode,
        intensity: inten,
        duration: ev.type === 'symptom' && ev.duration ? String(ev.duration).trim() : '',
        dose: ev.dose ? String(ev.dose).trim() : '',
        detail: ev.detail ? String(ev.detail).trim() : '',
        ts: ts
      });
    });
    return out;
  }

  /* Réponse JSON {events:[...]} -> liste d'événements validés (null si illisible) */
  function parseAIResponse(raw, now) {
    now = now || Date.now();
    var obj = extractJSON(raw);
    if (obj === undefined) return null;
    var list = Array.isArray(obj) ? obj : (obj && obj.events);
    if (!Array.isArray(list)) return null;
    return cleanEvents(list, now);
  }

  /* Réponse du chat {reply, events} -> { reply, events }. Si l'IA répond en texte simple, on le garde tel quel. */
  function parseChatResponse(raw, now) {
    now = now || Date.now();
    var txt = String(raw == null ? '' : raw).trim();
    if (!txt) return null;
    var obj = extractJSON(txt);
    if (obj === undefined || obj === null || typeof obj !== 'object') return { reply: txt, events: [] };
    var reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
    var events = cleanEvents(Array.isArray(obj.events) ? obj.events : [], now);
    if (!reply && !events.length) return null;
    return { reply: reply, events: events };
  }

  /* Instructions données à l'IA pour la conversation */
  function buildChatSystem(now, known, recent, digest, profile) {
    known = known || {};
    return "Tu es l'assistant d'un carnet de suivi de santé personnel. Tu discutes en français, en tutoyant, avec chaleur et simplicité, avec une personne qui a plusieurs maladies chroniques.\n" +
      "Tu as deux rôles :\n" +
      "1. Ranger dans le carnet ce qu'elle te raconte : symptômes, médicaments pris ponctuellement, changements de traitement de fond, notes diverses.\n" +
      "2. Répondre à ses questions sur son carnet, en t'appuyant uniquement sur les données fournies plus bas. Si elles ne suffisent pas, dis-le sans rien inventer.\n\n" +
      "Réponds UNIQUEMENT avec un objet JSON : {\"reply\":\"...\",\"events\":[...]}\n" +
      "- \"reply\" : ta réponse à afficher dans le chat (1 à 3 phrases courtes, sans listes ni mise en forme).\n" +
      "- \"events\" : les entrées à proposer à l'enregistrement (liste vide si la personne pose une question ou discute simplement). Format de chaque entrée :\n" +
      '  {"type":"symptom|medication|treatment|pharmacy|note","name":"...","intensity":0-10 ou null,"duration":"..." ou null,"dose":"..." ou null,"detail":"..." ou null,"when":"YYYY-MM-DDTHH:MM" ou null,"until":"YYYY-MM-DD" ou null,"mode":"continuous|intermittent" ou null}\n' +
      '  • symptom : symptôme ou douleur ressentie. "name" court (ex. "Maux de tête"). "intensity" sur 10 seulement si elle est donnée. "duration" si elle est dite (ex. "2 h", "toute la matinée"). "detail" pour une précision utile.\n' +
      '  • medication : médicament pris ponctuellement (en plus du traitement de fond). "dose" si dite (ex. "1 g", "2 comprimés"). "detail" pour la raison de la prise si elle est dite.\n' +
      '  • treatment : CHANGEMENT du traitement de fond (début, arrêt, nouvelle dose, changement de molécule). "name" = médicament, "detail" = ce qui change (ex. "de 10 mg à 20 mg", "arrêt").\n' +
      '  • pharmacy : passage à la pharmacie pour renouveler ou récupérer le traitement. "name" = "Passage à la pharmacie", "detail" = "mensuelle" ou "trimestrielle" si la personne le précise.\n' +
      '  • note : toute autre information utile au suivi (sommeil, stress, repas, activité, rendez-vous médical). "name" = titre très court, "detail" = le texte.\n' +
      "- \"when\" : heure locale calculée à partir de la date et heure actuelles (« il y a 2h », « ce matin vers 8h », « hier soir »). Si rien n'est précisé, mets null (cela veut dire « maintenant »).\n\n" +
      "Règles de conversation :\n" +
      "- Si une information importante manque (surtout l'intensité d'un symptôme), pose UNE seule question courte et mets la liste d'entrées de ce symptôme à vide. Dès que la personne a répondu, ou si elle ne sait pas, propose l'entrée complète. Ne repose jamais une question déjà posée.\n" +
      "- Souvenirs anciens : la personne peut raconter des choses passées (« il y a 3 mois », « le 3 mars »). Mets la date dans \"when\" (sans année, prends la plus récente dans le passé). Si elle décrit un symptôme qui a duré plusieurs jours (« du 5 au 12 septembre », « pendant un mois depuis le début de ma pilule »), ne demande PAS l'intensité (elle ne s'en souvient pas) : renvoie UNE seule entrée symptom avec \"when\" = jour de début, \"until\" = jour de fin (calcule-le à partir de la durée dite) et \"mode\" = \"continuous\" (en continu) ou \"intermittent\" (par moments).\n" +
      "- Si elle dit quand elle a commencé un traitement, propose aussi une entrée treatment avec \"detail\":\"Début\" à cette date. Regarde « Débuts de traitement déjà notés » dans le profil : n'en propose pas un second pour le même médicament.\n" +
      "- Les messages précédents de l'assistant peuvent se terminer par [Entrées : ...] : ce sont celles déjà proposées, enregistrées ou ignorées. Ne les propose pas une seconde fois.\n" +
      "- Réutilise exactement l'orthographe des noms déjà connus quand c'est le même symptôme ou médicament.\n" +
      "- Quand la personne décrit un symptôme, regarde son profil plus bas : si ce symptôme fait partie des symptômes connus d'une de ses maladies, ou des effets indésirables possibles d'un de ses traitements, dis-le simplement dans ta réponse (sans conclure : c'est une piste à confirmer avec le médecin).\n" +
      "- Tu ne poses aucun diagnostic et tu ne dis jamais de commencer, d'arrêter ou de modifier un traitement. Si les données évoquent un possible effet indésirable, tu proposes d'en parler au médecin ou au pharmacien, en rappelant qu'une coïncidence n'est pas une preuve.\n" +
      "- Si la personne décrit des signes qui peuvent être graves (douleur dans la poitrine, difficulté à respirer, malaise, paralysie, confusion, pensées suicidaires), dis-lui d'appeler tout de suite le 15 ou le 112 en France.\n\n" +
      "Date et heure actuelles : " + toPromptNow(now) + "\n" +
      "Symptômes déjà connus : " + ((known.symptoms || []).join(', ') || 'aucun') + "\n" +
      "Médicaments occasionnels déjà connus : " + ((known.meds || []).join(', ') || 'aucun') + "\n" +
      "Traitements de fond déjà connus : " + ((known.treatments || []).join(', ') || 'aucun') + "\n\n" +
      "Profil de la personne :\n" + (profile || 'non renseigné') + "\n\n" +
      "Analyse automatique du carnet :\n" + (digest || 'aucune') + "\n\n" +
      "Carnet des 14 derniers jours (date | type | contenu) :\n" + (recent || '(vide)');
  }

  /* Historique de conversation -> format attendu par Gemini (rôles alternés, commence par l'utilisateur) */
  function buildChatContents(history, text) {
    var msgs = (history || []).slice(-14)
      .map(function (m) { return { role: m.role === 'user' ? 'user' : 'model', text: m.text }; })
      .filter(function (m) { return m.text; });
    msgs.push({ role: 'user', text: text });
    var out = [];
    msgs.forEach(function (m) {
      var last = out[out.length - 1];
      if (last && last.role === m.role) last.parts[0].text += '\n' + m.text;
      else out.push({ role: m.role, parts: [{ text: m.text }] });
    });
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  /* Résumé compact des données récentes pour l'IA */
  function summarizeForAI(data, days, now) {
    now = now || Date.now();
    var since = now - days * 24 * HOUR;
    var lines = [];
    function add(type, arr, fmt) {
      (arr || []).filter(function (x) { return x.ts >= since; }).forEach(function (x) {
        lines.push({ ts: x.ts, text: toPromptNow(x.ts).replace(/ \(.*\)$/, '') + ' | ' + type + ' | ' + fmt(x) });
      });
    }
    add('symptôme', data.symptoms, function (x) {
      return x.name + (x.intensity != null ? ' (' + x.intensity + '/10)' : '') +
        (x.duration ? ' durée ' + x.duration : '') + (isPeriod('symptom', x) ? ' jusqu’au ' + ymd(x.endTs) + (x.mode === 'intermittent' ? ' (par moments)' : ' (en continu)') : '') + (x.note ? ' - ' + x.note : '');
    });
    add('médicament occasionnel', data.meds, function (x) {
      return x.name + (x.dose ? ' ' + x.dose : '') + (x.note ? ' - ' + x.note : '');
    });
    add('changement de traitement de fond', data.changes, function (x) {
      return x.name + ' : ' + (x.how ? x.how + ' ' : '') + (x.detail || '');
    });
    add('passage à la pharmacie', data.pharmacy, function (x) {
      return (RX[x.rx] || RX.monthly).label + (x.note ? ' - ' + x.note : '');
    });
    add('note', data.notes, function (x) {
      return x.name + (x.text ? ' - ' + x.text : '');
    });
    lines.sort(function (a, b) { return a.ts - b.ts; });
    if (lines.length > 150) lines = lines.slice(lines.length - 150);
    return lines.map(function (l) { return l.text; }).join('\n');
  }

  /* ---------- Dates (jour local) ---------- */

  function addDays(ts, n) { var d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

  function ymd(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* "YYYY-MM-DD" -> minuit local (null si invalide) */
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  }

  function fmtDay(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function fmtNum(n) {
    if (n == null || !isFinite(n)) return '';
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / DAYMS); }

  /* ---------- Prises du jour (matin, midi, soir) ---------- */

  var SLOT_KEYS = ['morning', 'noon', 'evening'];
  var SLOT_NAME = { morning: 'Prise du matin', noon: 'Prise du midi', evening: 'Prise du soir' };
  var SLOT_SHORT = { morning: 'matin', noon: 'midi', evening: 'soir' };
  var SOUND_IDS = ['carillon', 'doux', 'cloche', 'digital', 'radar'];

  function defaultSlots() {
    return {
      morning: { enabled: true, time: '08:00', notify: false, mode: 'sound', sound: 'carillon', repeat: 0, hideNames: false },
      noon: { enabled: false, time: '12:30', notify: false, mode: 'sound', sound: 'carillon', repeat: 0, hideNames: false },
      evening: { enabled: true, time: '20:30', notify: false, mode: 'sound', sound: 'carillon', repeat: 0, hideNames: false }
    };
  }

  function defaultPharmacySettings() {
    return { notify: true, time: '09:00', mode: 'sound', sound: 'doux' };
  }

  /* ---------- Traitements de fond ---------- */
  /*
    Un traitement : { id, name, strength, action, diseaseIds[], slots[], steps[], stock, sideEffects[], note }
    steps : liste d'étapes de posologie. { until:'YYYY-MM-DD' (dernier jour de l'étape, '' = sans limite),
            doses:{ morning:1, evening:0.5 } } (nombre de comprimés par prise).
    Une seule étape = dose fixe ; plusieurs = prise progressive.
    stock : { count, asOf } = nombre de comprimés connus à la date asOf.
  */

  function newDrug(p) {
    p = p || {};
    return {
      id: p.id || uid(),
      name: p.name || '',
      strength: p.strength || '',
      action: p.action || '',
      diseaseIds: p.diseaseIds || [],
      slots: p.slots || [],
      steps: p.steps && p.steps.length ? p.steps : [{ until: '', doses: {} }],
      stock: p.stock || null,
      sideEffects: p.sideEffects || [],
      note: p.note || ''
    };
  }

  /* Étape de posologie en vigueur un jour donné (null si le traitement est terminé) */
  function activeStep(drug, dayTs) {
    var steps = drug.steps || [];
    for (var i = 0; i < steps.length; i++) {
      if (!steps[i].until) return steps[i];
      var u = parseYmd(steps[i].until);
      if (u == null || dayTs <= u) return steps[i];
    }
    return null;
  }

  function dosesOn(drug, dayTs) {
    var st = activeStep(drug, dayTs);
    var out = {};
    if (!st) return out;
    (drug.slots || []).forEach(function (k) {
      var n = Number(st.doses && st.doses[k]);
      if (isFinite(n) && n > 0) out[k] = n;
    });
    return out;
  }

  function dailyDose(drug, dayTs) {
    var d = dosesOn(drug, dayTs), t = 0;
    Object.keys(d).forEach(function (k) { t += d[k]; });
    return t;
  }

  /* Médicaments d'une prise un jour donné : [{ drug, dose }] */
  function slotDrugs(data, slot, dayTs) {
    var out = [];
    (data.drugs || []).forEach(function (d) {
      var dose = dosesOn(d, dayTs)[slot];
      if (dose > 0) out.push({ drug: d, dose: dose });
    });
    return out;
  }

  /* Stock estimé au début de la journée de ts (consommation comptée jusqu'à la veille) */
  function stockAt(drug, ts) {
    var s = drug && drug.stock;
    if (!s || s.count == null || !isFinite(Number(s.count))) return null;
    var left = Number(s.count);
    var end = startOfDay(ts);
    for (var d = addDays(startOfDay(s.asOf), 1); d < end; d = addDays(d, 1)) left -= dailyDose(drug, d);
    return Math.max(0, Math.round(left * 100) / 100);
  }

  /* { remaining, daysLeft (null si pas de prise régulière), lastDay, ended, low } ou null si stock inconnu */
  function stockInfo(drug, now) {
    var rem = stockAt(drug, now);
    if (rem == null) return null;
    var left = rem, today = startOfDay(now), days = 0, ended = false, regular = false, limit = 400, i;
    for (i = 0; i < limit; i++) {
      var day = addDays(today, i);
      if (!activeStep(drug, day)) { ended = true; break; }
      var need = dailyDose(drug, day);
      if (need <= 0) continue;
      regular = true;
      if (left < need) break;
      left -= need;
      days++;
    }
    if (!regular) return { remaining: rem, daysLeft: null, lastDay: null, ended: ended, low: false };
    return {
      remaining: rem,
      daysLeft: days,
      lastDay: days > 0 ? addDays(today, days - 1) : null,
      ended: ended,
      low: !ended && days <= 7
    };
  }

  function dosesText(doses, slots) {
    var parts = [];
    (slots || SLOT_KEYS).forEach(function (k) {
      if (doses && doses[k] > 0) parts.push(SLOT_SHORT[k] + ' ' + fmtNum(doses[k]));
    });
    return parts.join(' · ');
  }

  /* Résumé de posologie : "matin 1 · soir 0,5" ou "matin 0,5 jusqu'au 7 oct., puis matin 1" */
  function posologyText(drug) {
    var steps = drug.steps || [];
    if (!drug.slots || !drug.slots.length) return 'Pas de prise régulière';
    var parts = steps.map(function (st) {
      var t = dosesText(st.doses, drug.slots) || 'aucune dose';
      var u = st.until ? parseYmd(st.until) : null;
      return t + (u != null ? ' jusqu’au ' + fmtDay(u) : '');
    });
    return parts.join(', puis ');
  }

  /* ---------- Ordonnances et rappels de pharmacie ---------- */

  var RX = {
    monthly: { days: 21, label: 'Ordonnance mensuelle' },
    quarterly: { days: 80, label: 'Ordonnance trimestrielle' }
  };

  function reminderDay(visit) {
    return addDays(startOfDay(visit.ts), (RX[visit.rx] || RX.monthly).days);
  }

  function atTime(dayTs, hhmm) {
    var p = String(hhmm || '09:00').split(':');
    var d = new Date(dayTs);
    d.setHours(Number(p[0]) || 0, Number(p[1]) || 0, 0, 0);
    return d.getTime();
  }

  /* Dernier passage de chaque type d'ordonnance et date du rappel */
  function pharmacyReminders(data, now) {
    var latest = {};
    (data.pharmacy || []).forEach(function (v) {
      var k = RX[v.rx] ? v.rx : 'monthly';
      if (!latest[k] || v.ts > latest[k].ts) latest[k] = v;
    });
    var set = data.pharmacySettings || defaultPharmacySettings();
    return Object.keys(latest).map(function (k) {
      var v = latest[k];
      var day = reminderDay(v);
      return {
        rx: k, label: RX[k].label, visit: v, day: day,
        ts: atTime(day, set.time), daysLeft: dayDiff(day, now), due: day <= startOfDay(now)
      };
    }).sort(function (a, b) { return a.day - b.day; });
  }

  /* Notifications à venir (pour les afficher et les programmer) */
  function upcomingNotifications(data, now, horizonDays) {
    horizonDays = horizonDays || 2;
    var out = [], today = startOfDay(now);
    SLOT_KEYS.forEach(function (k) {
      var cfg = (data.slots || {})[k];
      if (!cfg || !cfg.enabled || !cfg.notify) return;
      for (var i = 0; i <= horizonDays; i++) {
        var day = addDays(today, i), ts = atTime(day, cfg.time);
        if (ts <= now) continue;
        var list = slotDrugs(data, k, day);
        var body = !list.length ? 'Aucun médicament dans cette prise.'
          : cfg.hideNames ? 'C’est l’heure de ta ' + SLOT_NAME[k].toLowerCase() + '.'
          : list.map(function (x) { return x.drug.name + ' ' + fmtNum(x.dose); }).join(' · ');
        out.push({ kind: 'slot', slot: k, ts: ts, title: SLOT_NAME[k], body: body, mode: cfg.mode, sound: cfg.sound, repeat: cfg.repeat || 0 });
      }
    });
    var ps = data.pharmacySettings || defaultPharmacySettings();
    if (ps.notify) {
      pharmacyReminders(data, now).forEach(function (r) {
        if (r.ts > now) out.push({
          kind: 'pharmacy', ts: r.ts, title: 'Renouvellement d’ordonnance',
          body: 'Tu peux renouveler ton ' + r.label.toLowerCase() + ' à partir d’aujourd’hui.',
          mode: ps.mode, sound: ps.sound, repeat: 0
        });
      });
    }
    return out.sort(function (a, b) { return a.ts - b.ts; });
  }

  /* ---------- Infos sur les médicaments (action, effets indésirables) ---------- */

  function findInfo(data, name) {
    var k = normName(name);
    if (!k) return null;
    var list = data.drugs || [];
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i].name) === k && (list[i].action || (list[i].sideEffects || []).length)) {
        return { action: list[i].action || '', sideEffects: list[i].sideEffects || [] };
      }
    }
    var mi = (data.medInfo || {})[k];
    return mi ? { action: mi.action || '', sideEffects: mi.sideEffects || [] } : null;
  }

  /* ---------- Causes possibles d'un symptôme ---------- */

  /* Groupes de mots qui désignent le même symptôme */
  var SYNONYMS = [
    ['maux de tete', 'mal de tete', 'cephalee', 'migraine'],
    ['nausee', 'envie de vomir', 'mal au coeur'],
    ['fatigue', 'asthenie', 'epuisement', 'manque d energie'],
    ['vertige', 'etourdissement'],
    ['douleur abdominale', 'douleurs abdominales', 'mal au ventre', 'maux de ventre', 'douleurs d estomac', 'mal a l estomac', 'maux d estomac'],
    ['brulure d estomac', 'brulures d estomac', 'remontee acide', 'remontees acides', 'reflux'],
    ['insomnie', 'troubles du sommeil', 'mal dormi'],
    ['palpitation', 'tachycardie'],
    ['diarrhee'],
    ['constipation'],
    ['anxiete', 'angoisse'],
    ['somnolence', 'envie de dormir'],
    ['sueur', 'transpiration'],
    ['tremblement'],
    ['bouche seche']
  ];

  function symKey(name) {
    var n = normName(name);
    if (!n) return '';
    for (var i = 0; i < SYNONYMS.length; i++) {
      for (var j = 0; j < SYNONYMS[i].length; j++) {
        if (n === SYNONYMS[i][j] || (' ' + n + ' ').indexOf(' ' + SYNONYMS[i][j]) >= 0) return SYNONYMS[i][0];
      }
    }
    return n.replace(/s\b/g, '');
  }

  function sameSymptom(a, b) {
    var ka = symKey(a), kb = symKey(b);
    return !!ka && ka === kb;
  }

  function hasSymptom(list, symptom) {
    return (list || []).some(function (x) { return sameSymptom(x, symptom); });
  }

  function recentChange(data, drugName, now) {
    var k = normName(drugName), best = null;
    (data.changes || []).forEach(function (c) {
      if (normName(c.name) === k && c.ts <= now && c.ts >= now - 30 * DAYMS && (!best || c.ts > best.ts)) best = c;
    });
    return best;
  }

  var CAUSE_ORDER = { stat: 3 };

  /*
    Pistes pour un symptôme : maladies dont il fait partie, traitements de fond et médicaments occasionnels
    dont il est un effet indésirable connu ou observé après les prises. analysis = résultat de analyze() (facultatif).
  */
  function causesFor(data, symptom, now, analysis) {
    now = now || Date.now();
    var items = [];

    (data.diseases || []).forEach(function (d) {
      if (hasSymptom(d.symptoms, symptom)) {
        items.push({ kind: 'disease', label: d.name, score: 2,
          why: 'Fait partie des symptômes que tu as indiqués pour cette maladie.' });
      }
    });

    (data.drugs || []).forEach(function (d) {
      if (!hasSymptom(d.sideEffects, symptom)) return;
      var ch = recentChange(data, d.name, now);
      items.push({ kind: 'drug', label: d.name + (d.strength ? ' ' + d.strength : ''), score: ch ? 3 : 1,
        why: 'Effet indésirable connu' + (d.action ? ' (' + d.action.toLowerCase() + ')' : '') + '.' +
          (ch ? ' Traitement modifié le ' + fmtDay(ch.ts) + ' : à surveiller de près.' : '') });
    });

    var seen = {};
    (data.meds || []).forEach(function (m) {
      var k = normName(m.name);
      if (!k || seen[k]) return;
      seen[k] = true;
      var info = findInfo(data, m.name);
      var known = info && hasSymptom(info.sideEffects, symptom);
      var stat = null;
      if (analysis) {
        analysis.forEach(function (r) {
          if (normName(r.med) !== k || !r.enough) return;
          r.rows.forEach(function (row) {
            if (!sameSymptom(row.symptom, symptom)) return;
            var v = verdict(row, r.enough);
            if (row.newAfter >= 2 && (v.level === 'high' || v.level === 'mid')) stat = { row: row, level: v.level };
          });
        });
      }
      if (!known && !stat) return;
      var why = [];
      if (known) why.push('Effet indésirable connu' + (info.action ? ' (' + info.action.toLowerCase() + ')' : '') + '.');
      if (stat) why.push('Apparu après ' + stat.row.newAfter + ' prise(s) sur ' + stat.row.eligible + ' dans ton carnet' +
        (stat.row.baseline != null ? ' (en temps normal : ' + Math.round(stat.row.baseline * 100) + ' %)' : '') + '.');
      items.push({ kind: 'occasional', label: m.name, score: (known ? 1 : 0) + (stat ? (stat.level === 'high' ? 3 : 2) : 0), why: why.join(' ') });
    });

    items.sort(function (a, b) { return b.score - a.score; });
    return items.map(function (x) { return { kind: x.kind, label: x.label, why: x.why }; });
  }

  /* Recalcule et conserve les causes de chaque symptôme noté. Renvoie true si quelque chose a changé. */
  function updateCauses(data, now, windowHours) {
    now = now || Date.now();
    data.causes = data.causes || {};
    var analysis = analyze(data, windowHours || 6, now);
    var labels = displayNames(data.symptoms || []);
    var stats = {};
    (data.symptoms || []).forEach(function (s) {
      var k = symKey(s.name);
      if (!k) return;
      var e = stats[k] || (stats[k] = { count: 0, last: 0, names: [] });
      e.count++;
      var lt = Math.max(s.ts, s.endTs || 0);
      if (lt > e.last) e.last = lt;
      e.names.push(s);
    });
    var changed = false, next = {};
    Object.keys(stats).forEach(function (k) {
      var e = stats[k];
      var label = labels[normName(e.names[e.names.length - 1].name)] || e.names[0].name;
      var counts = {};
      e.names.forEach(function (s) { counts[s.name] = (counts[s.name] || 0) + 1; });
      label = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
      var items = causesFor(data, label, now, analysis);
      var old = data.causes[k];
      var entry = { symptom: label, count: e.count, last: e.last, items: items, at: now };
      if (old && old.aiNote) entry.aiNote = old.aiNote;
      if (old && old.count === entry.count && old.last === entry.last && old.symptom === label &&
          JSON.stringify(old.items) === JSON.stringify(items)) {
        entry.at = old.at;
      } else changed = true;
      next[k] = entry;
    });
    if (Object.keys(next).length !== Object.keys(data.causes).length) changed = true;
    data.causes = next;
    return changed;
  }

  /* ---------- Profil de santé donné à l'IA ---------- */

  function buildProfile(data, now) {
    now = now || Date.now();
    var lines = [];
    var diseases = data.diseases || [];
    lines.push('Maladies : ' + (diseases.length ? diseases.map(function (d) {
      return d.name + (d.diagnosed ? ' (diagnostic ' + d.diagnosed.slice(0, 7) + ')' : '') +
        (d.symptoms && d.symptoms.length ? ', symptômes : ' + d.symptoms.join(', ') : '');
    }).join(' ; ') : 'aucune renseignée'));
    var drugs = data.drugs || [];
    lines.push('Traitements de fond : ' + (drugs.length ? drugs.map(function (d) {
      var dis = (data.diseases || []).filter(function (x) { return (d.diseaseIds || []).indexOf(x.id) >= 0; }).map(function (x) { return x.name; });
      return d.name + (d.strength ? ' ' + d.strength : '') + ' (' + [
        d.action || null,
        dis.length ? 'pour : ' + dis.join(', ') : null,
        'prises : ' + posologyText(d),
        (d.sideEffects || []).length ? 'effets indésirables possibles : ' + d.sideEffects.join(', ') : null
      ].filter(Boolean).join(' ; ') + ')';
    }).join(' ; ') : 'aucun renseigné'));
    var starts = (data.changes || []).filter(function (c) { return c.how === 'Début'; }).slice(-15).map(function (c) { return c.name + ' (' + ymd(c.ts) + ')'; });
    lines.push('Débuts de traitement déjà notés : ' + (starts.length ? starts.join(', ') : 'aucun'));
    var causes = data.causes || {};
    var cl = Object.keys(causes).filter(function (k) { return causes[k].items.length; }).slice(0, 12).map(function (k) {
      return causes[k].symptom + ' : ' + causes[k].items.map(function (i) { return i.label; }).join(', ');
    });
    if (cl.length) lines.push('Pistes déjà repérées par symptôme : ' + cl.join(' ; '));
    return lines.join('\n');
  }

  /* ---------- Fiches remplies par l'IA ---------- */

  function cleanList(arr, max) {
    var out = [], seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (x) {
      var t = String(x == null ? '' : x).trim();
      var k = normName(t);
      if (t && k && !seen[k] && out.length < (max || 10)) { seen[k] = 1; out.push(t.slice(0, 80)); }
    });
    return out;
  }

  var AI_RULES = 'Réponds UNIQUEMENT avec un objet JSON valide, en français. Ce sont des informations générales qui seront relues et corrigées par la personne : n\'invente rien, et si tu ne connais pas, renvoie des listes vides.';

  function buildDiseasePrompt(name) {
    return {
      system: 'Tâche : fiche maladie. Tu remplis un carnet de santé personnel.\n' + AI_RULES + '\n' +
        'Format : {"symptoms":["..."],"treatments":[{"name":"...","action":"..."}]}\n' +
        '- "symptoms" : 3 à 8 symptômes principaux de la maladie, en mots simples.\n' +
        '- "treatments" : 1 à 5 médicaments couramment prescrits en France (nom de la molécule ou de la spécialité), avec "action" = leur rôle en quelques mots (ex. "Anxiolytique", "Antidouleur").',
      user: 'Maladie : ' + name
    };
  }

  function parseDiseaseInfo(raw) {
    var o = extractJSON(raw);
    if (!o || typeof o !== 'object') return null;
    var tr = [];
    (Array.isArray(o.treatments) ? o.treatments : []).forEach(function (t) {
      if (t && String(t.name || '').trim() && tr.length < 6) tr.push({ name: String(t.name).trim().slice(0, 60), action: String(t.action || '').trim().slice(0, 60) });
    });
    return { symptoms: cleanList(o.symptoms, 8), treatments: tr };
  }

  function buildDrugPrompt(name) {
    return {
      system: 'Tâche : fiche médicament. Tu remplis un carnet de santé personnel.\n' + AI_RULES + '\n' +
        'Format : {"action":"...","sideEffects":["..."],"diseases":["..."]}\n' +
        '- "action" : le rôle du médicament en 1 à 4 mots (ex. "Anxiolytique", "Antidouleur", "Anti-inflammatoire").\n' +
        '- "sideEffects" : les effets indésirables les plus fréquents, 4 à 10, en mots simples.\n' +
        '- "diseases" : les maladies pour lesquelles il est le plus souvent prescrit (jusqu\'à 4).',
      user: 'Médicament : ' + name
    };
  }

  function parseDrugInfo(raw) {
    var o = extractJSON(raw);
    if (!o || typeof o !== 'object') return null;
    return { action: String(o.action || '').trim().slice(0, 60), sideEffects: cleanList(o.sideEffects, 10), diseases: cleanList(o.diseases, 4) };
  }

  function buildAdvicePrompt(symptom, data, now) {
    var key = symKey(symptom), c = (data.causes || {})[key];
    return {
      system: 'Tâche : avis sur un symptôme. Tu aides une personne qui a plusieurs maladies chroniques à comprendre d\'où peut venir un symptôme de son carnet.\n' +
        'Réponds UNIQUEMENT avec un objet JSON : {"note":"..."}.\n' +
        '"note" : 2 à 4 phrases simples, en tutoyant. Appuie-toi uniquement sur le profil et les pistes ci-dessous. Rappelle que ce sont des pistes et pas un diagnostic, et propose d\'en parler au médecin ou au pharmacien si le symptôme est fréquent. Ne dis jamais de changer ou d\'arrêter un traitement.\n\n' +
        'Profil :\n' + buildProfile(data, now) + '\n\nAnalyse du carnet :\n' + analysisDigest(data, data.settings && data.settings.windowHours || 6, now) +
        '\n\nPistes calculées pour ce symptôme : ' + (c && c.items.length ? c.items.map(function (i) { return i.label + ' (' + i.why + ')'; }).join(' ; ') : 'aucune'),
      user: 'Symptôme : ' + symptom + (c ? ' (noté ' + c.count + ' fois)' : '')
    };
  }

  function parseAdvice(raw) {
    var o = extractJSON(raw);
    if (o && typeof o === 'object' && typeof o.note === 'string' && o.note.trim()) return o.note.trim();
    return null;
  }

  /* ---------- Sauvegarde / import ---------- */

  function emptyData() {
    return {
      symptoms: [], meds: [], changes: [], pharmacy: [], notes: [],
      diseases: [], drugs: [], medInfo: {}, causes: {},
      slots: defaultSlots(), pharmacySettings: defaultPharmacySettings(),
      settings: { windowHours: 6, model: 'gemini-2.5-flash' }
    };
  }

  function copyObj(x) {
    var y = {};
    for (var p in x) if (Object.prototype.hasOwnProperty.call(x, p)) y[p] = x[p];
    return y;
  }

  function normalizeImported(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var d = emptyData();
    ['symptoms', 'meds', 'changes', 'pharmacy', 'notes'].forEach(function (k) {
      if (!Array.isArray(obj[k])) return;
      d[k] = obj[k].filter(function (x) {
        return x && typeof x.ts === 'number' && isFinite(x.ts) && String(x.name || '').trim();
      }).map(function (x) {
        var y = copyObj(x);
        y.id = y.id || uid();
        return y;
      });
    });
    if (Array.isArray(obj.diseases)) {
      d.diseases = obj.diseases.filter(function (x) { return x && String(x.name || '').trim(); }).map(function (x) {
        var y = copyObj(x);
        y.id = y.id || uid();
        y.symptoms = cleanList(y.symptoms, 30);
        y.diagnosed = typeof y.diagnosed === 'string' ? y.diagnosed : '';
        y.note = typeof y.note === 'string' ? y.note : '';
        return y;
      });
    }
    if (Array.isArray(obj.drugs)) {
      d.drugs = obj.drugs.filter(function (x) { return x && String(x.name || '').trim(); }).map(function (x) {
        var y = newDrug(copyObj(x));
        y.diseaseIds = Array.isArray(x.diseaseIds) ? x.diseaseIds.slice() : [];
        y.slots = (Array.isArray(x.slots) ? x.slots : []).filter(function (k) { return SLOT_KEYS.indexOf(k) >= 0; });
        y.sideEffects = cleanList(x.sideEffects, 30);
        if (!(y.stock && isFinite(Number(y.stock.count)) && isFinite(Number(y.stock.asOf)))) y.stock = null;
        return y;
      });
    }
    if (obj.medInfo && typeof obj.medInfo === 'object') {
      Object.keys(obj.medInfo).forEach(function (k) {
        var m = obj.medInfo[k];
        if (m && typeof m === 'object') d.medInfo[k] = { action: String(m.action || ''), sideEffects: cleanList(m.sideEffects, 30) };
      });
    }
    if (obj.slots && typeof obj.slots === 'object') {
      SLOT_KEYS.forEach(function (k) { if (obj.slots[k]) d.slots[k] = Object.assign(d.slots[k], obj.slots[k]); });
    }
    if (obj.pharmacySettings && typeof obj.pharmacySettings === 'object') {
      d.pharmacySettings = Object.assign(d.pharmacySettings, obj.pharmacySettings);
    }
    if (obj.causes && typeof obj.causes === 'object') d.causes = obj.causes;
    return d;
  }

  return {
    HOUR: HOUR,
    DAYMS: DAYMS,
    KINDS: KINDS,
    ARRAY_OF: ARRAY_OF,
    SLOT_KEYS: SLOT_KEYS,
    SLOT_NAME: SLOT_NAME,
    SLOT_SHORT: SLOT_SHORT,
    SOUND_IDS: SOUND_IDS,
    RX: RX,
    normName: normName,
    uid: uid,
    startOfDay: startOfDay,
    addDays: addDays,
    ymd: ymd,
    parseYmd: parseYmd,
    fmtDay: fmtDay,
    fmtNum: fmtNum,
    dayDiff: dayDiff,
    toLocalInput: toLocalInput,
    toPromptNow: toPromptNow,
    displayNames: displayNames,
    topNames: topNames,
    monthGrid: monthGrid,
    entriesByDay: entriesByDay,
    emptyCounts: emptyCounts,
    isPeriod: isPeriod,
    spanText: spanText,
    hasStart: hasStart,
    analyze: analyze,
    analysisDigest: analysisDigest,
    verdict: verdict,
    defaultSlots: defaultSlots,
    defaultPharmacySettings: defaultPharmacySettings,
    newDrug: newDrug,
    activeStep: activeStep,
    dosesOn: dosesOn,
    dailyDose: dailyDose,
    slotDrugs: slotDrugs,
    stockAt: stockAt,
    stockInfo: stockInfo,
    dosesText: dosesText,
    posologyText: posologyText,
    reminderDay: reminderDay,
    atTime: atTime,
    pharmacyReminders: pharmacyReminders,
    upcomingNotifications: upcomingNotifications,
    findInfo: findInfo,
    symKey: symKey,
    sameSymptom: sameSymptom,
    causesFor: causesFor,
    updateCauses: updateCauses,
    buildProfile: buildProfile,
    buildDiseasePrompt: buildDiseasePrompt,
    parseDiseaseInfo: parseDiseaseInfo,
    buildDrugPrompt: buildDrugPrompt,
    parseDrugInfo: parseDrugInfo,
    buildAdvicePrompt: buildAdvicePrompt,
    parseAdvice: parseAdvice,
    parseAIResponse: parseAIResponse,
    parseChatResponse: parseChatResponse,
    buildChatSystem: buildChatSystem,
    buildChatContents: buildChatContents,
    summarizeForAI: summarizeForAI,
    emptyData: emptyData,
    normalizeImported: normalizeImported
  };
});
