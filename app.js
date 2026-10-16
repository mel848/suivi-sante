/* Suivi Santé : interface. Toutes les données restent sur le téléphone (localStorage).
   Seul le chat avec l'IA envoie du texte à Google Gemini, avec la clé de l'utilisateur. */
(function () {
  'use strict';

  var L = window.Logic;
  var STORE = 'suivi-sante-v1';
  var KEYSTORE = 'suivi-sante-apikey';
  var CHATSTORE = 'suivi-sante-chat';
  var DAY = 24 * 3600 * 1000;

  var KINDS = L.KINDS;
  var KIND_LABEL = { symptom: 'Symptôme', medication: 'Médicament pris', treatment: 'Traitement de fond', pharmacy: 'Passage à la pharmacie', note: 'Note' };
  var KIND_SHORT = { symptom: 'Symptôme', medication: 'Médicament', treatment: 'Traitement', pharmacy: 'Pharmacie', note: 'Note' };
  var KIND_COUNT = { symptom: ['symptôme', 'symptômes'], medication: ['médicament', 'médicaments'], treatment: ['changement de traitement', 'changements de traitement'], pharmacy: ['passage à la pharmacie', 'passages à la pharmacie'], note: ['note', 'notes'] };
  var HOW = ['Début', 'Arrêt', 'Dose modifiée', 'Autre'];
  var TITLES = { chat: 'Discuter', calendar: 'Calendrier', diseases: 'Mes maladies', treatments: 'Mes traitements', analysis: 'Analyse', settings: 'Réglages' };

  /* ---------- Données ---------- */

  var data = load();
  var today0 = new Date();
  var ui = {
    tab: 'chat',
    month: { y: today0.getFullYear(), m: today0.getMonth() },
    selDay: L.startOfDay(Date.now()),
    chat: loadChat(),
    chatBusy: false,
    stickBottom: true,
    scrollPanel: false,
    animate: true
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var parsed = JSON.parse(raw);
        var d = L.normalizeImported(parsed);
        if (d) {
          d.settings = Object.assign(L.emptyData().settings, parsed.settings || {});
          return d;
        }
      }
    } catch (e) { /* données illisibles : on repart de zéro sans rien écraser avant la prochaine saisie */ }
    return L.emptyData();
  }

  function save() {
    try {
      L.updateCauses(data, Date.now(), data.settings.windowHours || 6);
      localStorage.setItem(STORE, JSON.stringify(data));
      scheduleNotifications();
      return true;
    }
    catch (e) { toast('Impossible d’enregistrer : stockage plein ou bloqué.'); return false; }
  }

  function loadChat() {
    try {
      var arr = JSON.parse(localStorage.getItem(CHATSTORE) || '[]');
      if (Array.isArray(arr)) return arr.filter(function (m) { return m && (m.role === 'user' || m.role === 'ai') && typeof m.text === 'string'; });
    } catch (e) { /* conversation illisible : on repart d'une conversation vide */ }
    return [];
  }

  function saveChat() {
    try { localStorage.setItem(CHATSTORE, JSON.stringify(ui.chat.slice(-60))); } catch (e) { /* sans importance */ }
  }

  function arrFor(kind) { return data[L.ARRAY_OF[kind]]; }

  function getKey() {
    try { return localStorage.getItem(KEYSTORE) || ''; } catch (e) { return ''; }
  }

  /* ---------- Outils DOM ---------- */

  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }

  /* ---------- Icônes (traits simples, héritent la couleur du texte) ---------- */

  var ICONS = {
    symptom: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
    medication: '<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
    treatment: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
    pharmacy: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M12 9v6M9 12h6"/>',
    note: '<path d="M5 19l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L9 18z"/><path d="M14.5 6.5l3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
    noon: '<circle cx="12" cy="14" r="3.5"/><path d="M12 4v2.5M4.5 14H7M17 14h2.5M6.7 8.7l1.6 1.6M17.3 8.7l-1.6 1.6M3 20h18"/>',
    moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.8 6.8 0 0 0 10 10z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
    spark: '<path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9z"/><path d="M19 3v3M17.5 4.5h3"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };

  function icon(name, cls) {
    var span = document.createElement('span');
    span.className = 'ico ' + (cls || '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24">' + (ICONS[name] || '') + '</svg>';
    return span;
  }

  /* Pastille colorée d'un type d'entrée (la couleur ne désigne que ce type) */
  function kindIcon(kind, cls) { return icon(kind, 'kind ' + kind + ' ' + (cls || '')); }

  function emptyCard(name, text, cls) {
    return h('div', { class: 'card empty-card ' + (cls || '') }, icon(name, 'neutral big'), h('p', { text: text }));
  }

  /* ---------- Dates ---------- */

  var startOfDay = L.startOfDay;

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDayLong(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + fmtTime(ts);
  }

  function fmtShort(ts) {
    return startOfDay(ts) === startOfDay(Date.now()) ? fmtTime(ts) : fmtDateTime(ts);
  }

  function pct(p) { return Math.round(p * 100) + ' %'; }

  /* ---------- Entrées : textes ---------- */

  function entrySub(kind, it) {
    var parts = [];
    if (kind === 'symptom') {
      if (L.isPeriod(kind, it)) parts.push('Période ' + L.spanText(it.ts, it.endTs) + (it.mode === 'intermittent' ? ' · par moments' : ' · en continu'));
      if (it.intensity != null) parts.push('Intensité ' + it.intensity + '/10');
      if (it.duration && !L.isPeriod(kind, it)) parts.push('Durée ' + it.duration);
    } else if (kind === 'medication') {
      if (it.dose) parts.push(it.dose);
      if (it.qty > 0 && !/comprim|gélule|gelule|cp\b/.test(String(it.dose || '').toLowerCase())) parts.push(L.fmtNum(it.qty) + (it.qty > 1 ? ' comprimés' : ' comprimé'));
    } else if (kind === 'treatment') {
      if (it.how) parts.push(it.how);
      if (it.detail && it.detail !== it.how) parts.push(it.detail);
    } else if (kind === 'pharmacy') {
      parts.push((L.RX[it.rx] || L.RX.monthly).label.replace('Ordonnance ', 'Ordonnance '));
      if (it.items && it.items.length) parts.push(it.items.map(function (x) { return x.name + (x.qty ? ' ×' + L.fmtNum(x.qty) : ''); }).join(', '));
    } else if (it.text) {
      parts.push(it.text.length > 60 ? it.text.slice(0, 57) + '…' : it.text);
    }
    return parts.join(' · ');
  }

  function entryRow(kind, it, span) {
    var sub = entrySub(kind, it);
    var timeText = !span ? fmtTime(it.ts) : span.first ? 'Début' : span.last ? 'Fin' : 'Jour ' + (span.index + 1) + '/' + span.total;
    return h('button', { class: 'entry', type: 'button', onclick: function () { openDetail(kind, it); } },
      kindIcon(kind),
      h('div', { class: 'meta' },
        h('div', { class: 'kind', text: KIND_LABEL[kind] }),
        h('div', { class: 'name', text: it.name }),
        sub ? h('div', { class: 'sub', text: sub }) : null),
      h('div', { class: 'time', text: timeText }));
  }

  function countsLabel(counts) {
    var parts = [];
    KINDS.forEach(function (k) {
      if (counts[k]) parts.push(counts[k] + ' ' + KIND_COUNT[k][counts[k] > 1 ? 1 : 0]);
    });
    return parts.join(', ');
  }

  /* ---------- Formulaire (ajout, modification, vérification d'une proposition de l'IA) ---------- */

  /* Construit les champs d'un type d'entrée. v = valeurs de départ. Renvoie { el, read() }. */
  function buildFields(kind, v) {
    v = v || {};
    if (kind === 'pharmacy') return buildPharmacyFields(v);
    var nameLabels = { symptom: 'Symptôme', medication: 'Médicament', treatment: 'Médicament du traitement de fond', note: 'Titre' };
    var placeholders = { symptom: 'Ex. Maux de tête', medication: 'Ex. Nefopam', treatment: 'Ex. Levothyrox', note: 'Ex. Mauvaise nuit' };
    var name = h('input', { type: 'text', id: 'f-name', value: v.name || '', autocomplete: 'off', placeholder: placeholders[kind], 'aria-label': nameLabels[kind] });
    var names = kind === 'note' ? [] : L.topNames(arrFor(kind), 8);
    var chips = names.length ? h('div', { class: 'chips' }, names.map(function (n) {
      return h('button', { type: 'button', class: 'chip', text: n, onclick: function () { name.value = n; } });
    })) : null;

    var els = [
      chips,
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: nameLabels[kind] }), name)
    ];

    var intensity = v.intensity != null ? v.intensity : null;
    var duration, dose, qty, note, how, detail, text;

    if (kind === 'symptom') {
      var scale = h('div', { class: 'scale', role: 'group', 'aria-label': 'Intensité de 0 à 10' });
      for (var i = 0; i <= 10; i++) {
        (function (n) {
          var b = h('button', { type: 'button', text: String(n), 'aria-pressed': intensity === n ? 'true' : 'false', class: intensity === n ? 'on' : '' });
          b.addEventListener('click', function () {
            intensity = intensity === n ? null : n;
            Array.prototype.forEach.call(scale.children, function (c, idx) {
              var on = intensity === idx;
              c.classList.toggle('on', on);
              c.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
          scale.appendChild(b);
        })(i);
      }
      els.push(h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Intensité (facultatif, appuie à nouveau pour retirer)' }), scale));
      duration = h('input', { type: 'text', id: 'f-duration', value: v.duration || '', placeholder: 'Ex. 2 h, toute la matinée', 'aria-label': 'Durée' });
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Durée (facultatif)' }), duration));
      note = h('input', { type: 'text', id: 'f-note', value: v.note || '', placeholder: 'Ex. après le repas', 'aria-label': 'Note' });
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Précisions (facultatif)' }), note));
    } else if (kind === 'medication') {
      dose = h('input', { type: 'text', id: 'f-dose', value: v.dose || '', placeholder: 'Ex. 1 g ou 2 comprimés', 'aria-label': 'Dose' });
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Dose (facultatif)' }), dose));
      qty = h('input', { type: 'number', id: 'f-qty', inputmode: 'decimal', min: '0', step: 'any', value: v.qty != null ? String(v.qty) : '', placeholder: '1', 'aria-label': 'Nombre de comprimés pris' });
      els.push(h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Nombre de comprimés pris (retiré de ton stock)' }),
        h('span', { class: 'stepper' },
          h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Moins', text: '−', onclick: function (e) { e.preventDefault(); var n = num(qty.value); qty.value = String(Math.max(0, Math.round(((n == null ? 1 : n) - 0.5) * 4) / 4)); } }),
          qty,
          h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Plus', text: '+', onclick: function (e) { e.preventDefault(); var n = num(qty.value); qty.value = String(Math.round(((n == null ? 1 : n) + 0.5) * 4) / 4); } }))));
      note = h('input', { type: 'text', id: 'f-note', value: v.note || '', placeholder: 'Ex. pris pour la migraine', 'aria-label': 'Raison de la prise' });
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Raison de la prise (facultatif)' }), note));
    } else if (kind === 'treatment') {
      how = h('select', { id: 'f-how', 'aria-label': 'Type de changement' }, HOW.map(function (o) {
        return h('option', { value: o, text: o, selected: (v.how || 'Dose modifiée') === o });
      }));
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Type de changement' }), how));
      detail = h('input', { type: 'text', id: 'f-detail', value: v.detail || '', placeholder: 'Ex. de 10 mg à 20 mg par jour', 'aria-label': 'Posologie et précisions' });
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Posologie et précisions' }), detail));
    } else {
      text = h('textarea', { id: 'f-text', placeholder: 'Ex. Réveillé trois fois cette nuit, journée chargée…', 'aria-label': 'Texte de la note', style: 'min-height:96px' });
      text.value = v.text || '';
      els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Texte' }), text));
    }

    var when = h('input', { type: 'datetime-local', id: 'f-when', value: L.toLocalInput(v.ts || Date.now()), 'aria-label': 'Date et heure' });
    els.push(h('label', { class: 'field' }, h('span', { class: 'lbl', text: kind === 'symptom' ? 'Date et heure (début)' : 'Date et heure' }), when));

    var periodOn = !!(kind === 'symptom' && v.endTs && v.endTs > v.ts), pMode = v.mode || 'continuous', endIn = null;
    if (kind === 'symptom') {
      endIn = h('input', { type: 'date', id: 'f-end', value: periodOn ? L.ymd(v.endTs) : '', max: L.ymd(Date.now()), 'aria-label': 'Dernier jour' });
      var pBox = h('div');
      var drawP = function () {
        pBox.textContent = '';
        if (!periodOn) return;
        pBox.appendChild(field('Dernier jour du symptôme', endIn, 'Utile pour un souvenir ancien dont tu ne te rappelles pas l’intensité.'));
        pBox.appendChild(field('Comment ça s’est passé ?', segmented([['continuous', 'En continu'], ['intermittent', 'Par moments']], pMode, function (m) { pMode = m; })));
      };
      drawP();
      els.push(switchRow('Ça a duré plusieurs jours', periodOn, function (on) { periodOn = on; drawP(); }, 'Une seule saisie, affichée sur chaque jour du calendrier.'));
      els.push(pBox);
    }

    return {
      el: h('div', null, els),
      read: function () {
        var ts = Date.parse(when.value);
        var out = { name: name.value.trim(), ts: isNaN(ts) ? Date.now() : ts };
        if (kind === 'symptom') {
          out.intensity = intensity; out.duration = duration.value.trim(); out.note = note.value.trim();
          out.endTs = null; out.mode = null;
          if (periodOn) {
            var eTs = L.parseYmd(endIn.value);
            if (eTs == null) out.badEnd = true;
            else { out.endTs = Math.min(eTs + 23 * 3600000 + 59 * 60000, Date.now()); out.mode = pMode; }
          }
        }
        else if (kind === 'medication') { out.dose = dose.value.trim(); out.qty = num(qty.value); out.note = note.value.trim(); }
        else if (kind === 'treatment') { out.how = how.value; out.detail = detail.value.trim(); }
        else { out.text = text.value.trim(); }
        return out;
      }
    };
  }

  function validate(vals) {
    if (!vals.name) return 'Indique un nom.';
    if (vals.ts > Date.now() + 5 * 60 * 1000) return 'La date ne peut pas être dans le futur.';
    if (vals.badEnd) return 'Indique la date de fin de la période.';
    if (vals.endTs && startOfDay(vals.endTs) <= startOfDay(vals.ts)) return 'La fin doit être après le jour de début.';
    return null;
  }

  var sheetEl = null;

  function openSheet(title, body) {
    var panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('h2', { text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', text: '✕', onclick: closeSheet })),
      body);
    if (sheetEl) {            /* on remplace le contenu sans empiler une nouvelle entrée d'historique */
      sheetEl.textContent = '';
      sheetEl.appendChild(panel);
      return;
    }
    var overlay = h('div', { class: 'overlay', onclick: function (e) { if (e.target === overlay) closeSheet(); } }, panel);
    document.body.appendChild(overlay);
    document.body.classList.add('noscroll');
    sheetEl = overlay;
    try { history.pushState({ sheet: 1 }, ''); } catch (e) { /* sans importance */ }
  }

  function removeSheet() {
    if (sheetEl) {
      sheetEl.remove();
      sheetEl = null;
      document.body.classList.remove('noscroll');
    }
  }

  function closeSheet() {
    if (!sheetEl) return;
    if (history.state && history.state.sheet) history.back(); /* déclenche popstate -> removeSheet */
    else removeSheet();
  }

  window.addEventListener('popstate', removeSheet);

  function defaultTsFor(day) {
    return day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600 * 1000;
  }

  /* opts : { values, onSave(vals), defaultTs, title } */
  function openForm(kind, item, opts) {
    opts = opts || {};
    var editing = !!item;
    var start = item || opts.values || { ts: opts.defaultTs || Date.now() };
    var fields = buildFields(kind, start);
    var body = h('div', null,
      fields.el,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Annuler', onclick: closeSheet }),
        h('button', {
          class: 'btn primary', type: 'button', text: opts.onSave ? 'Valider' : 'Enregistrer', onclick: function () {
            var vals = fields.read();
            var err = validate(vals);
            if (err) { toast(err); return; }
            if (opts.onSave) opts.onSave(vals);
            else {
              if (editing) Object.assign(item, vals);
              else { vals.id = L.uid(); arrFor(kind).push(vals); if (kind === 'pharmacy') applyPharmacyStock(vals); ui.selDay = startOfDay(vals.ts); ui.month = { y: new Date(vals.ts).getFullYear(), m: new Date(vals.ts).getMonth() }; }
              if (save()) toast((editing ? 'Modifié.' : 'Enregistré.') + (kind === 'medication' ? stockNote([vals.name]) : ''));
            }
            closeSheet();
            render();
          }
        })));
    openSheet((editing ? 'Modifier' : opts.onSave ? 'Vérifier' : 'Ajouter') + ' : ' + KIND_LABEL[kind].toLowerCase(), body);
  }

  /* Fiche détaillée d'une entrée */
  function openDetail(kind, item) {
    var rows = [];
    function row(k, v) { if (v !== '' && v != null) rows.push(h('div', { class: 'row' }, h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(v) }))); }
    var period = L.isPeriod(kind, item);
    row(period ? 'Début' : 'Date', fmtDayLong(item.ts));
    if (period) {
      row('Fin', fmtDayLong(item.endTs));
      row('Durée', L.spanText(item.ts, item.endTs));
      row('Déroulement', item.mode === 'intermittent' ? 'Par moments' : 'En continu');
    } else row('Heure', fmtTime(item.ts));
    if (kind === 'symptom') {
      row('Intensité', item.intensity != null ? item.intensity + ' / 10' : '');
      if (!period) row('Durée', item.duration);
      row('Précisions', item.note);
    } else if (kind === 'medication') {
      row('Dose', item.dose);
      row('Comprimés pris', item.qty != null ? L.fmtNum(item.qty) : '');
      row('Raison de la prise', item.note);
    } else if (kind === 'treatment') {
      row('Type de changement', item.how);
      row('Posologie et précisions', item.detail);
    } else if (kind === 'pharmacy') {
      row('Ordonnance', (L.RX[item.rx] || L.RX.monthly).label.replace('Ordonnance ', '') + ' (rappel après ' + (L.RX[item.rx] || L.RX.monthly).days + ' jours)');
      row('Renouvellement possible le', fmtDayLong(L.reminderDay(item)));
      row('Médicaments récupérés', (item.items || []).map(function (x) { return x.name + (x.qty ? ' : ' + L.fmtNum(x.qty) + ' cp' : ''); }).join('\n'));
      row('Précisions', item.note);
    } else {
      row('Texte', item.text);
    }
    var body = h('div', null,
      h('span', { class: 'badge ' + kind, text: KIND_LABEL[kind] }),
      h('div', { style: 'font-size:1.3rem;font-weight:700;margin:2px 0 6px;overflow-wrap:anywhere', text: item.name }),
      h('div', { class: 'kv' }, rows),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Modifier', onclick: function () { openForm(kind, item); } }),
        h('button', {
          class: 'btn danger', type: 'button', text: 'Supprimer', onclick: function () {
            if (!window.confirm('Supprimer cette entrée ?')) return;
            var arr = arrFor(kind);
            var i = arr.indexOf(item);
            if (i >= 0) arr.splice(i, 1);
            save();
            closeSheet();
            render();
            toast('Supprimé.');
          }
        })));
    openSheet('Détail', body);
  }

  /* ---------- IA (Gemini) ---------- */

  function friendlyError(e) {
    var m = (e && e.message) || '';
    if (m === 'NOKEY') return 'Ajoute d’abord ta clé gratuite dans Réglages.';
    if (m === 'Réponse vide') return 'L’IA n’a pas donné de réponse (contenu bloqué ?). Reformule ou utilise la saisie rapide.';
    if (e && e.name === 'AbortError') return 'L’IA met trop de temps à répondre. Réessaie.';
    if (e && e.status === 429) return 'Quota gratuit atteint pour le moment. Réessaie plus tard, ou utilise la saisie rapide.';
    if (e && (e.status === 400 && /api key|API_KEY/i.test(m))) return 'Clé invalide. Vérifie-la dans Réglages.';
    if (e && e.status === 403) return 'Clé refusée par Google. Vérifie-la dans Réglages.';
    if (e && e.status === 404) return 'Aucun modèle Gemini disponible avec ta clé. Dans Réglages > Options avancées, écris « gemini-3.5-flash-lite ».';
    if (e && e.status >= 500) return 'Le service de Google est indisponible. Réessaie dans un moment.';
    if (e && e.status) return 'L’IA a renvoyé une erreur (' + e.status + ').';
    if (e && e.name === 'TypeError') return 'Pas de connexion internet.';
    return 'Erreur inattendue avec l’IA.';
  }

  /* contents : un texte, ou une liste de messages [{role, parts:[{text}]}] */
  var DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  var FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

  /* Réflexion réduite au minimum : les réponses arrivent en quelques secondes au lieu de plusieurs minutes */
  function thinkingFor(model) {
    if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
    if (/flash-lite|3\.6-flash|3-flash/.test(model)) return { thinkingLevel: 'minimal' };
    return { thinkingLevel: 'low' };
  }

  /* Essaie le modèle choisi ; s'il n'existe plus (404), passe aux suivants et retient celui qui marche */
  function callGemini(system, contents, wantJson) {
    var chosen = (data.settings.model || DEFAULT_MODEL).trim();
    var list = [chosen].concat(FALLBACK_MODELS.filter(function (m) { return m !== chosen; }));
    var i = 0;
    function next() {
      return callGeminiModel(list[i], system, contents, wantJson).then(function (txt) {
        if (list[i] !== chosen) { data.settings.model = list[i]; save(); }
        return txt;
      }, function (e) {
        if (e && e.status === 404 && i < list.length - 1) { i++; return next(); }
        throw e;
      });
    }
    return next();
  }

  function callGeminiModel(model, system, contents, wantJson) {
    return callGeminiRaw(model, system, contents, wantJson, true).catch(function (e) {
      /* réglage de réflexion refusé par ce modèle : on réessaie sans */
      if (e && e.status === 400) return callGeminiRaw(model, system, contents, wantJson, false);
      throw e;
    });
  }

  function callGeminiRaw(model, system, contents, wantJson, fast) {
    var key = getKey();
    if (!key) return Promise.reject(new Error('NOKEY'));
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    if (typeof contents === 'string') contents = [{ role: 'user', parts: [{ text: contents }] }];
    var body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: contents,
      generationConfig: { temperature: wantJson ? 0.3 : 0.4 }
    };
    if (wantJson) body.generationConfig.responseMimeType = 'application/json';
    if (fast) body.generationConfig.thinkingConfig = thinkingFor(model);

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; });
    }).then(function (x) {
      clearTimeout(timer);
      if (!x.r.ok) {
        var err = new Error((x.j && x.j.error && x.j.error.message) || 'HTTP ' + x.r.status);
        err.status = x.r.status;
        throw err;
      }
      var cand = x.j.candidates && x.j.candidates[0];
      var parts = cand && cand.content && cand.content.parts;
      if (!parts) {
        var blocked = new Error('Réponse vide');
        blocked.status = 0;
        throw blocked;
      }
      return parts.map(function (p) { return p.text || ''; }).join('');
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }

  function knownLists() {
    return {
      symptoms: L.topNames(data.symptoms, 25),
      meds: L.topNames(data.meds, 25),
      treatments: L.topNames(data.changes, 25)
    };
  }

  /* ---------- Chat ---------- */

  var STATE_LABEL = { pending: 'à vérifier', saved: 'enregistrée', skipped: 'ignorée' };

  /* Texte d'un message tel que l'IA le revoit dans l'historique */
  function historyText(m) {
    if (m.role === 'user' || !m.events || !m.events.length) return m.text;
    return m.text + ' [Entrées : ' + m.events.map(function (e) { return e.name + ' (' + STATE_LABEL[e.state || 'pending'] + ')'; }).join(', ') + ']';
  }

  function guessHow(detail) {
    var t = L.normName(detail);
    if (/arret|stop/.test(t)) return 'Arrêt';
    if (/debut|commenc|nouveau/.test(t)) return 'Début';
    if (/dose|mg|passage|augment|baiss|reduc/.test(t)) return 'Dose modifiée';
    return 'Autre';
  }

  /* Entrée de l'IA -> valeurs prêtes à être enregistrées (ou affichées dans le formulaire) */
  function eventToVals(ev) {
    var v = { name: ev.name, ts: ev.ts };
    if (ev.type === 'symptom') { v.intensity = ev.intensity != null ? ev.intensity : null; v.duration = ev.duration || ''; v.note = ev.detail || ''; v.endTs = ev.endTs || null; v.mode = ev.mode || null; }
    else if (ev.type === 'medication') { v.dose = ev.dose || ''; v.qty = ev.qty != null ? ev.qty : null; v.note = ev.detail || ''; }
    else if (ev.type === 'treatment') { v.how = ev.how || guessHow(ev.detail || ''); v.detail = ev.detail || ''; }
    else if (ev.type === 'pharmacy') { v.rx = ev.rx || (/trimestr|3 mois|90/.test(L.normName(ev.detail || '')) ? 'quarterly' : 'monthly'); v.items = ev.items || []; v.note = ''; }
    else { v.text = ev.detail || ''; }
    return v;
  }

  function applyVals(ev, vals) {
    ev.name = vals.name; ev.ts = vals.ts;
    if (ev.type === 'symptom') { ev.intensity = vals.intensity; ev.duration = vals.duration; ev.detail = vals.note; ev.endTs = vals.endTs || null; ev.mode = vals.mode || null; }
    else if (ev.type === 'medication') { ev.dose = vals.dose; ev.qty = vals.qty != null ? vals.qty : null; ev.detail = vals.note; }
    else if (ev.type === 'treatment') { ev.how = vals.how; ev.detail = vals.detail; }
    else if (ev.type === 'pharmacy') { ev.rx = vals.rx; ev.items = vals.items; ev.detail = vals.note; }
    else { ev.detail = vals.text; }
  }

  function saveProposals(m) {
    var pend = m.events.filter(function (e) { return e.state === 'pending'; });
    for (var i = 0; i < pend.length; i++) {
      var err = validate(eventToVals(pend[i]));
      if (err) { toast(pend[i].name + ' : ' + err); return; }
    }
    pend.forEach(function (ev) {
      var vals = eventToVals(ev);
      vals.id = L.uid();
      arrFor(ev.type).push(vals);
      ev.state = 'saved';
    });
    var lastTs = pend.length ? pend[pend.length - 1].ts : Date.now();
    ui.selDay = startOfDay(lastTs);
    ui.month = { y: new Date(lastTs).getFullYear(), m: new Date(lastTs).getMonth() };
    if (save()) toast(pend.length + (pend.length > 1 ? ' entrées enregistrées.' : ' entrée enregistrée.') + stockNote(pend.filter(function (e) { return e.type === 'medication'; }).map(function (e) { return e.name; })));
    saveChat();
    render();
  }

  function proposalCard(m) {
    var pending = m.events.filter(function (e) { return e.state === 'pending'; }).length;
    var card = h('div', { class: 'proposal' }, h('div', { class: 'ptitle', text: 'Entrées proposées' }));
    m.events.forEach(function (ev) {
      ev.state = ev.state || 'pending';
      var vals = eventToVals(ev);
      var sub = entrySub(ev.type, vals);
      var whenText = ev.type === 'symptom' && vals.endTs ? 'du ' + L.fmtDay(ev.ts) + ' au ' + L.fmtDay(vals.endTs) : fmtShort(ev.ts);
      var info = [h('div', { class: 'name', text: ev.name }), h('div', { class: 'sub', text: (sub ? sub + ' · ' : '') + whenText })];
      var item = h('div', { class: 'pitem ' + (ev.state === 'saved' ? 'done' : ev.state === 'skipped' ? 'skipped' : '') },
        kindIcon(ev.type, 'sm'));
      if (ev.state === 'pending') {
        item.appendChild(h('button', {
          class: 'ptap', type: 'button', 'aria-label': 'Modifier : ' + ev.name,
          onclick: function () {
            openForm(ev.type, null, { values: vals, onSave: function (nv) { applyVals(ev, nv); saveChat(); } });
          }
        }, info));
        item.appendChild(h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': 'Ignorer : ' + ev.name, text: '✕',
          onclick: function () { ev.state = 'skipped'; saveChat(); render(); }
        }));
      } else {
        item.appendChild(h('div', { class: 'meta', style: 'flex:1;min-width:0' }, info));
        item.appendChild(h('span', { class: 'pstate', text: ev.state === 'saved' ? '✓ Enregistrée' : ev.dup ? 'Déjà noté' : 'Ignorée' }));
      }
      card.appendChild(item);
      if (ev.type === 'treatment') {
        if (!findDrugByName(ev.name)) {
          card.appendChild(h('button', { class: 'chip', type: 'button', style: 'margin:0 0 8px', text: '+ Ajouter « ' + ev.name + ' » à Mes traitements',
            onclick: function () { openDrugForm(null, { name: ev.name }); } }));
        }
      }
    });
    if (pending) {
      card.appendChild(h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', text: pending > 1 ? 'Enregistrer (' + pending + ')' : 'Enregistrer', onclick: function () { saveProposals(m); } })));
    }
    return card;
  }

  function msgView(m) {
    var bubble = h('div', { class: 'bubble', text: m.text });
    var wrap = h('div', { class: 'msg ' + m.role }, m.role === 'ai' ? h('div', { class: 'ai-row' }, icon('spark', 'avatar'), bubble) : bubble);
    if (m.role === 'ai' && m.events && m.events.length) wrap.appendChild(proposalCard(m));
    return wrap;
  }

  var SUGGESTIONS = [
    'J’ai mal à la tête depuis ce matin',
    'J’ai pris du Nefopam',
    'Un de mes symptômes est-il lié à un de mes traitements ?'
  ];

  /* Résumé du jour : prochaine prise, saisies du jour, renouvellement, stock bas */
  function todayCard() {
    var now = Date.now(), today = startOfDay(now);
    var rows = [];

    var next = null;
    for (var i = 0; i <= 1 && !next; i++) {
      var day = L.addDays(today, i);
      L.SLOT_KEYS.forEach(function (k) {
        var cfg = data.slots[k];
        if (!cfg.enabled) return;
        var ts = L.atTime(day, cfg.time);
        var list = L.slotDrugs(data, k, day);
        if (ts > now && list.length && (!next || ts < next.ts)) next = { slot: k, ts: ts, list: list };
      });
    }
    if (next) {
      rows.push({ ico: icon(next.slot === 'morning' ? 'sun' : next.slot === 'noon' ? 'noon' : 'moon', 'neutral'), title: L.SLOT_NAME[next.slot] + ' · ' + fmtTime(next.ts),
        sub: next.list.map(function (x) { return x.drug.name + ' ' + (x.label || L.fmtNum(x.dose)); }).join(' · '), tab: 'treatments' });
    }

    var map = L.entriesByDay(data), td = map[today];
    rows.push({ ico: icon('calendar', 'neutral'), title: 'Aujourd’hui', sub: td ? countsLabel(td.counts) : 'Rien de noté pour le moment', tab: 'calendar' });

    L.SLOT_KEYS.some(function (k) {
      var cfg = data.slots[k];
      if (!cfg.enabled || L.atTime(today, cfg.time) > now || L.takenOn(data, k, today) || !L.slotDrugs(data, k, today).length) return false;
      rows.push({ ico: icon('check', 'neutral'), title: L.SLOT_NAME[k] + ' à confirmer', sub: 'Touche pour la marquer comme faite', run: function () { markSlotDone(k, today); } });
      return true;
    });

    var rem = L.pharmacyReminders(data, now)[0];
    if (rem) {
      rows.push({ ico: kindIcon('pharmacy'), title: rem.due ? 'Renouvellement possible dès maintenant' : 'Renouvellement ' + (rem.daysLeft === 1 ? 'demain' : 'dans ' + rem.daysLeft + ' jours'),
        sub: rem.label + ' · le ' + L.fmtDay(rem.day), tab: 'treatments' });
    }
    var low = data.drugs.map(function (d) { return { d: d, s: L.stockInfo(d, now, data) }; }).filter(function (x) { return x.s && x.s.low; })[0];
    if (low) rows.push({ ico: icon('medication', 'neutral'), title: 'Stock bas : ' + low.d.name, sub: low.s.daysLeft == null ? 'Il reste ' + L.fmtNum(low.s.remaining) + (low.s.remaining > 1 ? ' comprimés' : ' comprimé') : low.s.daysLeft === 0 ? 'À renouveler maintenant' : 'Il reste environ ' + low.s.daysLeft + (low.s.daysLeft > 1 ? ' jours' : ' jour'), tab: 'treatments' });

    var card = h('div', { class: 'card today' });
    rows.forEach(function (r) {
      card.appendChild(h('button', { class: 'today-row', type: 'button', onclick: function () { if (r.run) r.run(); else go(r.tab); } },
        r.ico, h('span', { class: 'tx' }, h('span', { class: 'tt', text: r.title }), h('span', { class: 'ts', text: r.sub }))));
    });
    return card;
  }

  function viewChat() {
    var frag = h('div');
    if (data.drugs.length || data.symptoms.length || data.pharmacy.length) frag.appendChild(todayCard());
    if (!getKey()) {
      frag.appendChild(h('div', { class: 'notice' },
        h('p', { style: 'margin:0 0 8px', text: 'L’IA est désactivée : ajoute ta clé gratuite pour discuter avec elle. Les boutons « + » en bas fonctionnent sans.' }),
        h('button', { class: 'chip', type: 'button', text: 'Ouvrir les réglages', onclick: function () { go('settings'); } })));
    }
    var list = h('div', { class: 'chat' });
    if (!ui.chat.length) {
      list.appendChild(h('div', { class: 'msg ai' },
        h('div', { class: 'ai-row' }, icon('spark', 'avatar'), h('div', { class: 'bubble', text: 'Bonjour ! Raconte-moi comment tu te sens, ce que tu as pris ou si ton traitement a changé : je range tout dans ton carnet. Tu peux aussi me poser des questions sur tes notes.' })),
        h('div', { class: 'suggest' }, SUGGESTIONS.map(function (s) {
          return h('button', {
            class: 'chip', type: 'button', text: s, onclick: function () {
              var input = document.getElementById('chat-input');
              input.value = s; autoGrow(); input.focus();
            }
          });
        }))));
    }
    ui.chat.forEach(function (m) { list.appendChild(msgView(m)); });
    if (ui.chatBusy) {
      list.appendChild(h('div', { class: 'msg ai' }, h('div', { class: 'ai-row' }, icon('spark', 'avatar'),
        h('div', { class: 'bubble typing', role: 'status', 'aria-label': 'L’IA écrit' }, h('i'), h('i'), h('i')))));
    }
    frag.appendChild(list);
    return frag;
  }

  function submitChat() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text || ui.chatBusy) return;
    if (!getKey()) { toast('Ajoute d’abord ta clé gratuite dans Réglages.'); return; }

    var history = ui.chat.map(function (m) { return { role: m.role, text: historyText(m) }; });
    var now = Date.now();
    ui.chat.push({ id: L.uid(), role: 'user', text: text });
    input.value = '';
    autoGrow();
    ui.chatBusy = true;
    ui.stickBottom = true;
    saveChat();
    render();

    var system = L.buildChatSystem(now, knownLists(), L.summarizeForAI(data, 14, now), L.analysisDigest(data, data.settings.windowHours || 6, now), L.buildProfile(data, now));
    callGemini(system, L.buildChatContents(history, text), true)
      .then(function (raw) {
        var res = L.parseChatResponse(raw, Date.now());
        ui.chatBusy = false;
        if (!res) {
          toast('Je n’ai pas réussi à lire la réponse de l’IA. Réessaie.');
        } else {
          ui.chat.push({
            id: L.uid(), role: 'ai',
            text: res.reply || 'Voilà ce que j’ai compris. Vérifie puis enregistre.',
            events: res.events.map(function (ev) {
              ev.state = 'pending';
              if (ev.type === 'treatment' && guessHow(ev.detail || '') === 'Début' && L.hasStart(data, ev.name)) { ev.state = 'skipped'; ev.dup = true; }
              return ev;
            })
          });
          saveChat();
        }
        ui.stickBottom = true;
        render();
      })
      .catch(function (e) {
        ui.chatBusy = false;
        toast(friendlyError(e));
        render();
      });
  }

  function autoGrow() {
    var input = document.getElementById('chat-input');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 130) + 'px';
    updateComposerSpace();
  }

  function updateComposerSpace() {
    var c = document.getElementById('composer');
    document.documentElement.style.setProperty('--composer-h', (c.offsetHeight || 130) + 'px');
  }

  function buildQuickAdd() {
    var box = document.getElementById('quickadd');
    box.textContent = '';
    KINDS.forEach(function (k) {
      box.appendChild(h('button', {
        class: 'chip', type: 'button', onclick: function () { openForm(k, null, { defaultTs: Date.now() }); }
      }, icon(k, 'glyph ' + k), '+ ' + KIND_SHORT[k]));
    });
  }

  /* ---------- Onglet : Calendrier ---------- */

  function shiftMonth(delta) {
    var d = new Date(ui.month.y, ui.month.m + delta, 1);
    ui.month = { y: d.getFullYear(), m: d.getMonth() };
    var now = new Date();
    ui.selDay = (now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth()) ? startOfDay(Date.now()) : null;
    render();
  }

  function viewCalendar() {
    var frag = h('div');
    var y = ui.month.y, m = ui.month.m;
    var map = L.entriesByDay(data);
    var todayTs = startOfDay(Date.now());

    frag.appendChild(h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois précédent', text: '‹', onclick: function () { shiftMonth(-1); } }),
      h('h2', { text: new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois suivant', text: '›', onclick: function () { shiftMonth(1); } })));

    frag.appendChild(h('div', { class: 'cal-week', 'aria-hidden': 'true' },
      ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(function (d) { return h('span', { text: d }); })));

    var grid = h('div', { class: 'cal-grid' });
    L.monthGrid(y, m).forEach(function (c) {
      if (!c.inMonth) { grid.appendChild(h('div', { class: 'cal-cell blank', 'aria-hidden': 'true' })); return; }
      var e = map[c.ts];
      var counts = e ? e.counts : L.emptyCounts();
      var label = fmtDayLong(c.ts) + ' : ' + (e ? countsLabel(counts) : 'aucune saisie');
      var total = counts.symptom + counts.medication + counts.treatment + counts.pharmacy + counts.note;
      var per = e ? e.items.filter(function (x) { return x.kind === 'symptom' && x.span; })[0] : null;
      var cls = 'cal-cell' + (e ? ' has' : '') + (total >= 3 ? ' act3' : total ? ' act1' : '') + (e ? ' k-' + KINDS.filter(function (k) { return counts[k]; })[0] : '')
        + (per ? ' per' + (per.span.first ? ' pf' : '') + (per.span.last ? ' pl' : '') : '') + (c.ts === todayTs ? ' today' : '') + (c.ts === ui.selDay ? ' sel' : '');
      grid.appendChild(h('button', {
        class: cls, type: 'button', 'aria-label': label, 'aria-pressed': c.ts === ui.selDay ? 'true' : 'false',
        onclick: function () { ui.selDay = c.ts; ui.scrollPanel = true; render(); }
      },
        h('span', { class: 'num', text: String(c.day) }),
        h('span', { class: 'cal-dots', 'aria-hidden': 'true' }, KINDS.filter(function (k) { return counts[k]; }).map(function (k) {
          return h('i', { class: k + ' on' });
        }))));
    });
    frag.appendChild(grid);

    frag.appendChild(h('div', { class: 'legend' }, KINDS.map(function (k) {
      return h('span', null, icon(k, 'glyph ' + k), KIND_SHORT[k]);
    })));
    frag.appendChild(h('div', { style: 'margin:8px 0 0' },
      h('button', {
        class: 'chip', type: 'button', text: 'Aujourd’hui', onclick: function () {
          var n = new Date();
          ui.month = { y: n.getFullYear(), m: n.getMonth() };
          ui.selDay = todayTs; ui.scrollPanel = true; render();
        }
      })));

    /* Détail du jour choisi */
    var panel = h('div', { id: 'day-panel' });
    if (ui.selDay == null) {
      panel.appendChild(h('div', { class: 'empty', text: 'Touche un jour pour voir le détail.' }));
    } else {
      panel.appendChild(h('div', { class: 'day-title', text: fmtDayLong(ui.selDay) }));
      var items = map[ui.selDay] ? map[ui.selDay].items : [];
      if (items.length) items.forEach(function (x) { panel.appendChild(entryRow(x.kind, x.it, x.span)); });
      else panel.appendChild(h('div', { class: 'empty', text: 'Rien de noté ce jour-là.' }));
      if (ui.selDay <= todayTs) {
        panel.appendChild(h('div', { class: 'addrow' }, KINDS.map(function (k) {
          return h('button', {
            class: 'chip', type: 'button',
            onclick: function () { openForm(k, null, { defaultTs: defaultTsFor(ui.selDay) }); }
          }, icon(k, 'glyph ' + k), '+ ' + KIND_SHORT[k]);
        })));
      }
    }
    frag.appendChild(panel);
    return frag;
  }

  /* ---------- Onglet : Analyse ---------- */

  /* ---------- Graphiques de l'analyse ---------- */

  var DAY_LET = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  var KIND_VAR = { symptom: 'var(--sym)', medication: 'var(--med)', treatment: 'var(--chg)', pharmacy: 'var(--pha)', note: 'var(--note)' };

  function chartCard(title, sub) {
    var c = h('div', { class: 'card chart' }, h('h3', { text: title }));
    if (sub) c.appendChild(h('div', { class: 'small muted', text: sub }));
    return c;
  }

  function overviewCharts(frag) {
    var now = Date.now(), today = startOfDay(now);
    var range = ui.range || 14;
    var from = L.addDays(today, -(range - 1));
    var map = L.entriesByDay(data);

    frag.appendChild(h('h2', { class: 'sec', text: 'Vue d’ensemble' }));
    frag.appendChild(h('div', { class: 'segmented' }, [7, 14, 30].map(function (n) {
      return h('button', { type: 'button', class: range === n ? 'on' : '', text: n + ' jours', 'aria-pressed': range === n ? 'true' : 'false',
        onclick: function () { ui.range = n; render(); } });
    })));

    var days = [], totals = L.emptyCounts(), grand = 0;
    for (var i = 0; i < range; i++) {
      var ts = L.addDays(from, i), e = map[ts], cn = e ? e.counts : L.emptyCounts();
      days.push({ ts: ts, counts: cn, sum: KINDS.reduce(function (s, k) { return s + (cn[k] || 0); }, 0) });
      KINDS.forEach(function (k) { totals[k] += cn[k] || 0; grand += cn[k] || 0; });
    }
    if (!grand) {
      frag.appendChild(emptyCard('chart', 'Rien de noté sur cette période : les graphiques apparaîtront dès les premières saisies.'));
      return;
    }

    /* 1. Activité par jour */
    var max = Math.max.apply(null, days.map(function (d) { return d.sum; }).concat([1]));
    var colsEl = h('div', { class: 'cols' + (range > 14 ? ' dense' : '') });
    days.forEach(function (d, i) {
      var seg = h('div', { class: 'stack' });
      KINDS.slice().reverse().forEach(function (k) {
        if (d.counts[k]) seg.appendChild(h('i', { style: 'flex:' + d.counts[k] + ';background:' + KIND_VAR[k] }));
      });
      var lab = new Date(d.ts);
      var showLab = range <= 14 || i % 5 === 0 || i === range - 1;
      colsEl.appendChild(h('div', { class: 'col' + (d.ts === today ? ' now' : '') },
        h('div', { class: 'bars', title: fmtDayLong(d.ts) + ' : ' + d.sum }, h('div', { class: 'barwrap', style: 'height:' + Math.round(d.sum / max * 100) + '%' }, seg)),
        h('span', { class: 'xl', text: showLab ? (range <= 7 ? DAY_LET[lab.getDay()] : String(lab.getDate())) : '' })));
    });
    var c1 = chartCard('Activité par jour', 'Nombre de saisies, par couleur de type');
    c1.appendChild(colsEl);
    c1.appendChild(h('div', { class: 'legend' }, KINDS.map(function (k) { return h('span', null, h('i', { class: 'dot', style: 'background:' + KIND_VAR[k] }), KIND_SHORT[k]); })));
    frag.appendChild(c1);

    /* 2. Répartition (anneau) */
    var acc = 0, stops = [];
    KINDS.forEach(function (k) {
      if (!totals[k]) return;
      var a = acc / grand * 360, b = (acc + totals[k]) / grand * 360;
      stops.push(KIND_VAR[k] + ' ' + a + 'deg ' + b + 'deg'); acc += totals[k];
    });
    var c2 = chartCard('Répartition des saisies');
    c2.appendChild(h('div', { class: 'donut-row' },
      h('div', { class: 'donut', style: 'background:conic-gradient(' + stops.join(',') + ')' }, h('div', { class: 'hole' }, h('b', { text: String(grand) }), h('span', { text: 'saisies' }))),
      h('div', { class: 'dlist' }, KINDS.filter(function (k) { return totals[k]; }).map(function (k) {
        return h('div', null, h('i', { class: 'dot', style: 'background:' + KIND_VAR[k] }), h('span', { text: KIND_SHORT[k] }), h('b', { text: String(totals[k]) }));
      }))));
    frag.appendChild(c2);

    /* 3. Symptômes les plus fréquents */
    var syms = data.symptoms.filter(function (s) { return startOfDay(s.ts) >= from; });
    var byName = {};
    syms.forEach(function (s) { byName[s.name] = (byName[s.name] || 0) + 1; });
    var top = Object.keys(byName).sort(function (a, b) { return byName[b] - byName[a]; }).slice(0, 6);
    if (top.length) {
      var c3 = chartCard('Symptômes les plus fréquents');
      top.forEach(function (n) {
        c3.appendChild(h('div', { class: 'hbar' }, h('span', { class: 'hl', text: n }),
          h('div', { class: 'track' }, h('i', { style: 'width:' + Math.round(byName[n] / byName[top[0]] * 100) + '%' })), h('b', { text: String(byName[n]) })));
      });
      frag.appendChild(c3);
    }

    /* 4. Intensité moyenne par jour */
    var pts = [];
    days.forEach(function (d, i) {
      var v = syms.filter(function (s) { return startOfDay(s.ts) === d.ts && s.intensity != null && s.intensity !== '' && !isNaN(Number(s.intensity)); }).map(function (s) { return Number(s.intensity); });
      if (v.length) pts.push({ i: i, v: v.reduce(function (a, b) { return a + b; }, 0) / v.length });
    });
    if (pts.length >= 2) {
      var W = 300, H = 110, px = function (i) { return 14 + i / Math.max(1, range - 1) * (W - 28); }, py = function (v) { return H - 14 - v / 10 * (H - 28); };
      var path = pts.map(function (p, k) { return (k ? 'L' : 'M') + px(p.i).toFixed(1) + ' ' + py(p.v).toFixed(1); }).join(' ');
      var area = path + ' L' + px(pts[pts.length - 1].i).toFixed(1) + ' ' + (H - 14) + ' L' + px(pts[0].i).toFixed(1) + ' ' + (H - 14) + ' Z';
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="spark" role="img" aria-label="Intensité moyenne des symptômes">' +
        [0, 5, 10].map(function (g) { return '<line x1="14" x2="' + (W - 14) + '" y1="' + py(g) + '" y2="' + py(g) + '" class="grid"/><text x="0" y="' + (py(g) + 3) + '" class="gl">' + g + '</text>'; }).join('') +
        '<path d="' + area + '" class="area"/><path d="' + path + '" class="line"/>' +
        pts.map(function (p) { return '<circle cx="' + px(p.i).toFixed(1) + '" cy="' + py(p.v).toFixed(1) + '" r="3.5" class="pt"/>'; }).join('') + '</svg>';
      var c4 = chartCard('Intensité moyenne des symptômes', 'Sur 10, les jours où elle est notée');
      var holder = h('div'); holder.innerHTML = svg; c4.appendChild(holder);
      frag.appendChild(c4);
    }

    /* 5. Moment de la journée */
    if (syms.length) {
      var parts = [{ n: 'Nuit', a: 0, b: 6, c: 0 }, { n: 'Matin', a: 6, b: 12, c: 0 }, { n: 'Après-midi', a: 12, b: 18, c: 0 }, { n: 'Soir', a: 18, b: 24, c: 0 }];
      syms.forEach(function (s) { var hr = new Date(s.ts).getHours(); parts.forEach(function (p) { if (hr >= p.a && hr < p.b) p.c++; }); });
      var pm = Math.max.apply(null, parts.map(function (p) { return p.c; }).concat([1]));
      var c5 = chartCard('Quand apparaissent les symptômes');
      c5.appendChild(h('div', { class: 'vparts' }, parts.map(function (p) {
        return h('div', { class: 'vp' }, h('b', { text: String(p.c) }), h('div', { class: 'vtrack' }, h('i', { style: 'height:' + Math.round(p.c / pm * 100) + '%' })), h('span', { text: p.n }));
      })));
      frag.appendChild(c5);
    }

    /* 6. Stock des traitements */
    var stocks = data.drugs.map(function (d) { return { d: d, s: L.stockInfo(d, now, data) }; }).filter(function (x) { return x.s; });
    if (stocks.length) {
      var c6 = chartCard('Stock des traitements', 'Jours restants (traitement régulier) ou comprimés (si besoin), estimés');
      function sv(x) { return x.s.daysLeft != null ? x.s.daysLeft : x.s.remaining; }
      stocks.sort(function (a, b) { return (b.s.low - a.s.low) || (sv(a) - sv(b)); }).forEach(function (x) {
        c6.appendChild(h('div', { class: 'hbar' + (x.s.low ? ' low' : '') }, h('span', { class: 'hl', text: x.d.name }),
          h('div', { class: 'track' }, h('i', { style: 'width:' + Math.max(4, Math.min(100, Math.round(sv(x) / 30 * 100))) + '%' })),
          h('b', { text: x.s.daysLeft != null ? x.s.daysLeft + ' j' : L.fmtNum(x.s.remaining) + ' cp' })));
      });
      frag.appendChild(c6);
    }
  }

  function viewAnalysis() {
    var frag = h('div');
    var W = data.settings.windowHours || 6;

    overviewCharts(frag);
    causesSection(frag);
    frag.appendChild(h('h2', { class: 'sec', text: 'Symptômes après une prise' }));
    frag.appendChild(h('p', { class: 'muted', text: 'Pour chaque médicament pris occasionnellement, voici quels symptômes apparaissent dans les heures qui suivent, comparé à ce qui arrive d’habitude.' }));

    frag.appendChild(h('div', { class: 'small muted', style: 'margin:0 0 6px', text: 'Durée observée après chaque prise :' }));
    frag.appendChild(h('div', { class: 'segmented' }, [2, 6, 12, 24].map(function (n) {
      return h('button', {
        type: 'button', class: W === n ? 'on' : '', text: n + ' h', 'aria-pressed': W === n ? 'true' : 'false',
        onclick: function () { data.settings.windowHours = n; save(); render(); }
      });
    })));

    var res = L.analyze(data, W, Date.now());
    if (!res.length) {
      frag.appendChild(emptyCard('chart', 'Note quelques prises de médicaments et symptômes : l’analyse apparaîtra ici.'));
    }

    res.forEach(function (r) {
      var card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'med-head' },
        h('h3', { text: r.med }),
        h('span', { class: 'small muted', text: r.total + (r.total > 1 ? ' prises' : ' prise') })));
      card.appendChild(h('div', { class: 'small muted', text: 'Environ ' + (Math.round(r.perWeek * 10) / 10).toLocaleString('fr-FR') + ' fois par semaine · dernière prise ' + fmtDateTime(r.last) }));

      if (r.pending) card.appendChild(h('div', { class: 'small muted', text: r.pending + ' prise(s) trop récente(s), pas encore comptée(s).' }));
      if (!r.enough) card.appendChild(h('div', { class: 'notice', style: 'margin-top:10px', text: 'Encore ' + Math.max(1, 3 - r.analysed) + ' prise(s) à noter avant de pouvoir comparer correctement.' }));

      var fresh = r.rows.filter(function (x) { return x.newAfter > 0; });
      var already = r.rows.filter(function (x) { return x.newAfter === 0 && x.alreadyBefore > 0; });

      if (!fresh.length) {
        card.appendChild(h('p', { class: 'small muted', style: 'margin:10px 0 0', text: 'Aucun nouveau symptôme noté après la prise.' }));
      }
      fresh.forEach(function (row) {
        var v = L.verdict(row, r.enough);
        var tag = v.level === 'high' ? 'À surveiller' : v.level === 'mid' ? 'Un peu plus' : (r.enough && row.newAfter >= 2 && row.ratio != null) ? 'Rien de notable' : 'Trop tôt';
        card.appendChild(h('div', { class: 'row-sym' },
          h('div', { class: 'top' },
            h('span', { class: 'nm', text: row.symptom }),
            h('span', { class: 'badge ' + (tag === 'Trop tôt' ? 'none' : v.level), text: tag })),
          h('div', { class: 'hbar cmp' }, h('span', { class: 'hl', text: 'Après la prise' }),
            h('div', { class: 'track' }, h('i', { style: 'width:' + Math.round((row.pctNew || 0) * 100) + '%' })), h('b', { text: pct(row.pctNew || 0) })),
          row.baseline != null ? h('div', { class: 'hbar cmp base' }, h('span', { class: 'hl', text: 'En temps normal' }),
            h('div', { class: 'track' }, h('i', { style: 'width:' + Math.round(row.baseline * 100) + '%' })), h('b', { text: pct(row.baseline) })) : null,
          h('div', { class: 'small muted', text: row.newAfter + ' prise(s) sur ' + row.eligible }),
          h('div', { class: 'small muted', text: v.text })));
      });
      if (already.length) {
        card.appendChild(h('p', { class: 'small muted', style: 'margin:12px 0 0' },
          'Déjà présents avant la prise (probablement la raison de la prise, donc non comptés) : ' +
          already.map(function (x) { return x.symptom; }).join(', ') + '.'));
      }
      frag.appendChild(card);
    });

    frag.appendChild(h('div', { class: 'notice info' },
      'Lecture prudente : ce comparatif montre des coïncidences dans tes notes, pas une preuve. Un symptôme noté juste après un médicament peut aussi venir de ta maladie, ou revenir chaque jour à la même heure. Si une ligne est signalée « À surveiller », montre-la à ton médecin ou à ton pharmacien, et ne change jamais un traitement sans leur avis.'));

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Un doute sur ces résultats ?' }),
      h('p', { class: 'small muted', text: 'Discute-en avec l’IA : elle connaît ton carnet et cette analyse.' }),
      h('button', {
        class: 'btn block', type: 'button', text: 'En parler dans le chat', onclick: function () {
          go('chat');
          var input = document.getElementById('chat-input');
          input.value = 'Peux-tu m’expliquer ces résultats d’analyse ?';
          autoGrow();
          input.focus();
        }
      })));
    return frag;
  }

  /* ---------- Onglet : Réglages ---------- */

  /* Rappels sur ce téléphone : état réel des autorisations et des rappels programmés */
  function notifCheckCard() {
    var SN = window.SuiviNotif;
    if (!SN || !SN.diagnose) {
      return h('div', { class: 'card' },
        h('h2', { text: 'Rappels sur ce téléphone' }),
        h('div', { class: 'notif-check' }, h('div', { class: 'nc-row ko' }, h('b', { text: '✕' }), h('span', { text: !SN
          ? 'Le module de rappels du téléphone n’est pas démarré : aucune notification ne peut être programmée. ' + (function () {
            var i = window.__nativeInfo, C = window.Capacitor;
            if (!i) return 'Détail : le fichier native.js n’a pas été chargé par l’application (il manque dans l’APK : vérifie le workflow et index.html).';
            if (!i.cap) return 'Détail : native.js est chargé mais l’application n’est pas reconnue comme une appli Android (Capacitor absent). Ouvre bien l’APK installé, pas un navigateur.';
            if (!i.native) return 'Détail : native.js est chargé, mais la plateforme détectée est « ' + (i.platform || 'inconnue') + ' » au lieu d’Android.';
            return 'Détail : le plugin de notifications n’a pas pu démarrer' + (i.err ? ' (' + i.err + ')' : '') + '. Il manque probablement dans l’APK : vérifie package.json (@capacitor/local-notifications).';
          })()
          : 'Cette version de l’application contient un ancien module de rappels (fichier native.js pas à jour). Mets à jour native.js sur GitHub, puis réinstalle l’APK.' }))));
    }
    var out = h('div', { class: 'notif-check', 'aria-live': 'polite' });
    var card = h('div', { class: 'card' },
      h('h2', { text: 'Rappels sur ce téléphone' }),
      h('p', { class: 'small muted', text: 'Si tu ne reçois pas tes rappels, appuie sur « Vérifier » : je regarde les autorisations et les rappels réellement programmés.' }),
      out);
    var fmt = function (ts) { return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' à ' + fmtTime(ts); };
    function row(ok, text) { return h('div', { class: 'nc-row ' + (ok ? 'ok' : 'ko') }, h('b', { text: ok ? '✓' : '✕' }), h('span', { text: text })); }
    function check() {
      out.textContent = 'Vérification…';
      return Promise.resolve(window.SuiviNotif.schedule(L.upcomingNotifications(data, Date.now(), 7)))
        .then(function () { return new Promise(function (r) { setTimeout(r, 400); }); })
        .then(function () { return window.SuiviNotif.diagnose(); })
        .then(function (d) {
          out.textContent = '';
          out.appendChild(row(d.perm === 'granted', d.perm === 'granted' ? 'Notifications autorisées' : 'Notifications NON autorisées : appuie sur « Autoriser » ou active-les dans les réglages du téléphone (Applis > Suivi Santé > Notifications).'));
          if (d.exact) out.appendChild(row(d.exact === 'granted', d.exact === 'granted' ? 'Alarmes précises autorisées' : 'Alarmes précises NON autorisées : les rappels peuvent arriver en retard. Appuie sur « Alarmes précises ».'));
          var n = d.pending.filter(function (x) { return x.at > Date.now(); });
          out.appendChild(row(n.length > 0, n.length ? n.length + ' rappel' + (n.length > 1 ? 's' : '') + ' programmé' + (n.length > 1 ? 's' : '') + '. Prochain : ' + n[0].title + ', ' + fmt(n[0].at) : 'Aucun rappel programmé : vérifie que « Me rappeler cette prise » est activé dans Traitements.'));
          if (d.err) out.appendChild(row(false, 'Erreur du système : ' + d.err));
          out.appendChild(h('p', { class: 'small muted', text: 'Si tout est vert mais que rien ne sonne : dans les réglages du téléphone, mets Suivi Santé en « batterie : sans restriction » (Applis > Suivi Santé > Batterie), car certains téléphones endorment les applis.' }));
        }).catch(function (e) { out.textContent = 'Vérification impossible : ' + (e && e.message || e); });
    }
    card.appendChild(h('div', { class: 'actions wrap' },
      h('button', { class: 'btn primary', type: 'button', text: 'Vérifier', onclick: check }),
      h('button', { class: 'btn', type: 'button', text: 'Autoriser', onclick: function () { window.SuiviNotif.askPermission().then(check); } }),
      h('button', { class: 'btn', type: 'button', text: 'Alarmes précises', onclick: function () { window.SuiviNotif.askExact(); } })));
    return card;
  }

  function viewSettings() {
    var frag = h('div');

    var keyInput = h('input', { type: 'password', id: 's-key', value: getKey(), autocomplete: 'off', placeholder: 'Colle ta clé ici', 'aria-label': 'Clé API Gemini' });
    var modelInput = h('input', { type: 'text', id: 's-model', value: data.settings.model || DEFAULT_MODEL, autocomplete: 'off', 'aria-label': 'Modèle' });

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Apparence' }),
      h('p', { class: 'small muted', text: 'Choisis une ambiance : elle ne teinte que le fond et les cartes. Les couleurs des types de saisie ne changent pas.' }),
      h('div', { class: 'swatches' }, AMBIANCES.map(function (a) {
        var on = (data.settings.ambiance == null ? 'nuit' : data.settings.ambiance) === a.id;
        return h('button', { class: 'swatch' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { data.settings.ambiance = a.id; save(); applyAmbiance(); render(); } },
          h('i', { style: 'background:' + a.c }), h('span', { text: a.name }));
      }))));

    frag.appendChild(notifCheckCard());

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'IA gratuite (Google Gemini)' }),
      h('p', { class: 'small muted', text: 'Pour obtenir ta clé gratuite : ouvre aistudio.google.com/apikey dans ton navigateur, connecte-toi avec ton compte Google, appuie sur « Créer une clé API », copie-la et colle-la ci-dessous. Elle reste uniquement sur ce téléphone.' }),
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Clé API' }), keyInput),
      h('button', {
        class: 'btn small', type: 'button', text: 'Afficher / masquer', onclick: function () {
          keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        }
      }),
      h('div', { style: 'height:12px' }),
      h('details', null,
        h('summary', { text: 'Options avancées' }),
        h('label', { class: 'field' }, h('span', { class: 'lbl', text: 'Modèle Gemini à utiliser' }), modelInput)),
      h('div', { class: 'actions' },
        h('button', {
          class: 'btn primary', type: 'button', text: 'Enregistrer', onclick: function () {
            try { localStorage.setItem(KEYSTORE, keyInput.value.trim()); } catch (e) { toast('Impossible d’enregistrer la clé.'); return; }
            data.settings.model = modelInput.value.trim() || DEFAULT_MODEL;
            save();
            toast('Réglages enregistrés.');
          }
        }),
        h('button', {
          class: 'btn', type: 'button', text: 'Tester', onclick: function () {
            try { localStorage.setItem(KEYSTORE, keyInput.value.trim()); } catch (e) { /* ignoré */ }
            data.settings.model = modelInput.value.trim() || DEFAULT_MODEL;
            save();
            toast('Test en cours…');
            callGemini('Réponds uniquement par le mot : OK', 'Test', false)
              .then(function () { toast('La clé fonctionne.'); })
              .catch(function (e) { toast(friendlyError(e)); });
          }
        })),
      h('p', { class: 'small muted', style: 'margin:12px 0 0', text: 'Confidentialité : seuls les messages du chat partent chez Google, avec un résumé de tes 14 derniers jours de notes pour qu’elle puisse te répondre. Sur l’offre gratuite, Google peut réutiliser ces textes pour améliorer ses services : évite d’y mettre ton nom ou des informations d’identité. Le calendrier, la saisie avec les boutons « + » et l’analyse fonctionnent sans rien envoyer.' })));

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Conversation avec l’IA' }),
      h('button', {
        class: 'btn block', type: 'button', text: 'Effacer la conversation', onclick: function () {
          if (!window.confirm('Effacer la conversation ? Tes entrées déjà enregistrées ne sont pas touchées.')) return;
          ui.chat = [];
          saveChat();
          toast('Conversation effacée.');
        }
      })));

    /* Sauvegarde */
    var exportBox = h('textarea', { readonly: true, id: 's-export', 'aria-label': 'Sauvegarde', style: 'min-height:80px' });
    exportBox.value = JSON.stringify({ taken: data.taken, symptoms: data.symptoms, meds: data.meds, changes: data.changes, pharmacy: data.pharmacy, notes: data.notes, diseases: data.diseases, drugs: data.drugs, medInfo: data.medInfo, slots: data.slots, pharmacySettings: data.pharmacySettings, settings: { windowHours: data.settings.windowHours } });
    var importBox = h('textarea', { id: 's-import', placeholder: 'Colle ici une sauvegarde à importer', 'aria-label': 'Importer une sauvegarde', style: 'min-height:80px' });

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Sauvegarde de tes données' }),
      h('p', { class: 'small muted', text: 'Tes données sont uniquement sur ce téléphone : si tu désinstalles l’application ou changes de téléphone, elles sont perdues. Copie ta sauvegarde de temps en temps et colle-la dans une note ou un mail à toi-même.' }),
      exportBox,
      h('div', { style: 'height:10px' }),
      h('button', {
        class: 'btn block', type: 'button', text: 'Copier la sauvegarde', onclick: function () {
          exportBox.focus(); exportBox.select();
          var done = function () { toast('Sauvegarde copiée.'); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(exportBox.value).then(done, function () {
              try { document.execCommand('copy'); done(); } catch (e) { toast('Copie impossible : sélectionne le texte et copie-le.'); }
            });
          } else {
            try { document.execCommand('copy'); done(); } catch (e) { toast('Copie impossible : sélectionne le texte et copie-le.'); }
          }
        }
      }),
      h('div', { style: 'height:16px' }),
      importBox,
      h('div', { style: 'height:10px' }),
      h('button', {
        class: 'btn block', type: 'button', text: 'Importer (ajoute ce qui manque)', onclick: function () {
          var parsed;
          try { parsed = JSON.parse(importBox.value); } catch (e) { toast('Ce texte n’est pas une sauvegarde valide.'); return; }
          var d = L.normalizeImported(parsed);
          if (!d) { toast('Ce texte n’est pas une sauvegarde valide.'); return; }
          var added = 0;
          ['symptoms', 'meds', 'changes', 'pharmacy', 'notes', 'diseases', 'drugs', 'taken'].forEach(function (k) {
            var have = {};
            data[k].forEach(function (x) { have[x.id] = 1; });
            d[k].forEach(function (x) { if (!have[x.id]) { data[k].push(x); added++; } });
          });
          save();
          toast(added + ' entrée(s) ajoutée(s).');
          importBox.value = '';
          render();
        }
      })));

    frag.appendChild(h('div', { class: 'card' },
      h('h2', { text: 'Effacer' }),
      h('button', {
        class: 'btn danger block', type: 'button', text: 'Effacer toutes mes données', onclick: function () {
          if (!window.confirm('Effacer définitivement toutes les entrées de ce téléphone ? Pense à copier ta sauvegarde avant.')) return;
          data.taken = []; data.symptoms = []; data.meds = []; data.changes = []; data.pharmacy = []; data.notes = []; data.diseases = []; data.drugs = []; data.medInfo = {}; data.causes = {};
          save();
          render();
          toast('Données effacées.');
        }
      })));

    frag.appendChild(h('p', { class: 'small muted', style: 'text-align:center', text: 'Carnet de suivi personnel : ce n’est pas un dispositif médical et il ne remplace pas l’avis d’un professionnel de santé.' }));
    return frag;
  }

  /* ---------- Composants communs : interrupteur, choix, étiquettes, sons ---------- */

  function num(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) && n >= 0 ? n : null;
  }

  function switchRow(label, checked, onchange, hint) {
    var input = h('input', { type: 'checkbox', checked: checked, role: 'switch' });
    input.addEventListener('change', function () { onchange(input.checked); });
    return h('label', { class: 'switch-row' },
      h('span', { class: 'sw-text' },
        h('span', { class: 'sw-label', text: label }),
        hint ? h('span', { class: 'sw-hint', text: hint }) : null),
      h('span', { class: 'switch' }, input, h('i', { 'aria-hidden': 'true' })));
  }

  /* options : [[valeur, libellé], ...] */
  function segmented(options, value, onchange) {
    var wrap = h('div', { class: 'segmented', role: 'group' });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', text: o[1], class: o[0] === value ? 'on' : '', 'aria-pressed': o[0] === value ? 'true' : 'false' });
      b.addEventListener('click', function () {
        value = o[0];
        Array.prototype.forEach.call(wrap.children, function (c, i) {
          var on = options[i][0] === value;
          c.classList.toggle('on', on);
          c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        onchange(value);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function field(label, control, hint) {
    return h('div', { class: 'field' },
      h('span', { class: 'lbl', text: label }), control,
      hint ? h('div', { class: 'small muted', style: 'margin-top:4px', text: hint }) : null);
  }

  /* Liste d'étiquettes modifiable (symptômes d'une maladie, effets indésirables…) */
  function tagEditor(list, placeholder, label) {
    var items = list.slice();
    var box = h('div', { class: 'tags' });
    var input = h('input', { type: 'text', placeholder: placeholder, autocomplete: 'off', 'aria-label': label });
    function draw() {
      box.textContent = '';
      items.forEach(function (t, i) {
        box.appendChild(h('span', { class: 'tag' }, t,
          h('button', { type: 'button', 'aria-label': 'Retirer ' + t, text: '✕', onclick: function () { items.splice(i, 1); draw(); } })));
      });
      if (!items.length) box.appendChild(h('span', { class: 'small muted', text: 'Aucun pour le moment.' }));
    }
    function addOne(t) {
      t = String(t || '').trim();
      if (!t) return;
      if (items.some(function (x) { return L.normName(x) === L.normName(t); })) return;
      items.push(t);
      draw();
    }
    function commit() {
      input.value.split(',').forEach(addOne);
      input.value = '';
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    draw();
    return {
      el: h('div', null, box,
        h('div', { class: 'tag-input' }, input, h('button', { class: 'btn small', type: 'button', text: 'Ajouter', onclick: commit }))),
      get: function () { commit(); return items.slice(); },
      add: addOne,
      has: function (t) { return items.some(function (x) { return L.normName(x) === L.normName(t); }); }
    };
  }

  var SOUNDS = [
    { id: 'carillon', label: 'Carillon', notes: [[784, 0], [988, 0.18], [1175, 0.36]] },
    { id: 'doux', label: 'Doux', notes: [[523, 0], [659, 0.3]] },
    { id: 'cloche', label: 'Cloche', notes: [[880, 0], [880, 0.5]] },
    { id: 'digital', label: 'Digital', notes: [[1200, 0], [1200, 0.12], [1200, 0.24]] },
    { id: 'radar', label: 'Radar', notes: [[660, 0], [880, 0.15], [660, 0.3], [880, 0.45]] }
  ];
  var audioCtx = null;

  function playSound(id) {
    var s = SOUNDS.filter(function (x) { return x.id === id; })[0] || SOUNDS[0];
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime + 0.02;
      s.notes.forEach(function (n) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + n[1];
        o.type = 'sine';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.45);
      });
      return true;
    } catch (e) { return false; }
  }

  /* Notification : l'APK la confiera au système Android ; ici (démo) elle s'affiche dans l'application */
  function showNotification(n) {
    if (window.SuiviNotif && window.SuiviNotif.show) { window.SuiviNotif.show(n, playSound); return; }
    toast(n.title + ' : ' + n.body);
    if (n.mode === 'sound') playSound(n.sound);
  }

  /* Boutons de la notification de rappel : « Fait » et « Reporter » (10, 20 ou 30 min) */
  function markSlotDone(slot, day, silent) {
    L.markTaken(data, slot, day, Date.now());
    if (window.SuiviNotif && window.SuiviNotif.cancelKey) { try { window.SuiviNotif.cancelKey(slot + ':' + L.startOfDay(day)); } catch (e) { /* sans importance */ } }
    if (save() && !silent) toast(L.SLOT_NAME[slot] + ' : notée comme faite.');
    render();
  }

  function openSnooze(extra) {
    var body = h('div', null,
      h('p', { class: 'small muted', text: L.SLOT_NAME[extra.slot] + ' : le rappel reviendra après ce délai.' }),
      h('div', { class: 'snooze' }, [10, 20, 30].map(function (m) {
        return h('button', { class: 'btn', type: 'button', text: 'Dans ' + m + ' min', onclick: function () {
          if (window.SuiviNotif && window.SuiviNotif.snooze) window.SuiviNotif.snooze(extra, m);
          closeSheet(); toast('Rappel reporté de ' + m + ' min.');
        } });
      })),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', text: 'Annuler', onclick: closeSheet })));
    openSheet('Reporter le rappel', body);
  }

  function handleNotifAction(actionId, extra) {
    if (!extra || extra.kind !== 'slot' || L.SLOT_KEYS.indexOf(extra.slot) < 0) return;
    if (actionId === 'fait') { removeSheet(); markSlotDone(extra.slot, extra.day || Date.now()); go('treatments'); }
    else if (actionId === 'reporter') openSnooze(extra);
  }
  window.__suiviNotifAction = handleNotifAction;
  window.addEventListener('suivi-notif-action', function (e) { handleNotifAction(e.detail.actionId, e.detail.extra); });

  function scheduleNotifications() {
    if (window.SuiviNotif && window.SuiviNotif.schedule) {
      try { window.SuiviNotif.schedule(L.upcomingNotifications(data, Date.now(), 7)); } catch (e) { /* sans importance */ }
    }
  }

  function askAI(prompt, parser) {
    return callGemini(prompt.system, prompt.user, true).then(function (raw) {
      var res = parser(raw);
      if (res == null) throw new Error('Réponse illisible');
      return res;
    });
  }

  function aiError(e) {
    toast(e && e.message === 'Réponse illisible' ? 'Je n’ai pas réussi à lire la réponse de l’IA. Réessaie.' : friendlyError(e));
  }

  function findDrugByName(name) {
    var k = L.normName(name);
    return data.drugs.filter(function (d) { return L.normName(d.name) === k; })[0] || null;
  }

  function diseaseNames(ids) {
    return data.diseases.filter(function (d) { return (ids || []).indexOf(d.id) >= 0; }).map(function (d) { return d.name; });
  }

  function fmtLongDate(s) {
    var ts = L.parseYmd(s);
    return ts == null ? '' : new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Passage à la pharmacie (formulaire commun à l'agenda et à l'onglet Traitements) ---------- */

  function buildPharmacyFields(v) {
    var rx = v.rx || 'monthly';
    var qty = {};
    (v.items || []).forEach(function (i) { qty[i.drugId] = i.qty; });
    var when = h('input', { type: 'datetime-local', id: 'f-when', value: L.toLocalInput(v.ts || Date.now()), 'aria-label': 'Date et heure' });
    var preview = h('div', { class: 'notice info' });
    function drawPreview() {
      var ts = Date.parse(when.value);
      if (isNaN(ts)) ts = Date.now();
      var r = L.RX[rx];
      preview.textContent = 'Rappel de renouvellement prévu le ' + fmtDayLong(L.reminderDay({ ts: ts, rx: rx })) + ' (' + r.days + ' jours après ce passage).';
    }
    when.addEventListener('input', drawPreview);

    var rxSeg = segmented([['monthly', 'Mensuelle'], ['quarterly', 'Trimestrielle']], rx, function (val) { rx = val; drawPreview(); });
    var inputs = {};
    var drugBox = h('div', { class: 'drug-qty' });
    if (!data.drugs.length) {
      drugBox.appendChild(h('p', { class: 'small muted', text: 'Ajoute tes traitements dans l’onglet Traitements pour indiquer ici ce que tu as récupéré.' }));
    }
    data.drugs.forEach(function (d) {
      var inp = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '1', placeholder: '0', value: qty[d.id] != null ? String(qty[d.id]) : '', 'aria-label': 'Comprimés récupérés : ' + d.name });
      inputs[d.id] = inp;
      drugBox.appendChild(h('label', { class: 'qty-row' }, h('span', { text: d.name + (d.strength ? ' ' + d.strength : '') }), inp));
    });
    var note = h('input', { type: 'text', id: 'f-note', value: v.note || '', placeholder: 'Ex. pharmacie de la gare', 'aria-label': 'Précisions' });
    drawPreview();

    return {
      el: h('div', null,
        field('Type d’ordonnance', rxSeg, 'Mensuelle : rappel au bout de 21 jours. Trimestrielle : rappel au bout de 80 jours.'),
        field('Date et heure', when),
        preview,
        data.drugs.length ? field('Comprimés récupérés (facultatif, met ton stock à jour)', drugBox) : drugBox,
        field('Précisions (facultatif)', note)),
      read: function () {
        var ts = Date.parse(when.value);
        var items = [];
        data.drugs.forEach(function (d) {
          var n = num(inputs[d.id].value);
          if (n > 0) items.push({ drugId: d.id, name: d.name, qty: n });
        });
        return { name: 'Passage à la pharmacie', ts: isNaN(ts) ? Date.now() : ts, rx: rx, items: items, note: note.value.trim() };
      }
    };
  }

  /* Après une prise « si besoin » : stock restant du médicament, s'il est suivi dans Traitements */
  function stockNote(names) {
    var out = [], seen = {};
    names.forEach(function (n) {
      var d = L.matchDrug(data, n);
      if (!d || seen[d.id]) return;
      seen[d.id] = 1;
      var s = L.stockInfo(d, Date.now(), data);
      if (s) out.push(d.name + ' : il reste ' + L.fmtNum(s.remaining) + (s.remaining > 1 ? ' comprimés' : ' comprimé'));
    });
    return out.length ? ' ' + out.join(' · ') + '.' : '';
  }

  /* Ajoute au stock les comprimés récupérés (une seule fois, à l'enregistrement du passage) */
  function applyPharmacyStock(vals) {
    (vals.items || []).forEach(function (it) {
      var d = data.drugs.filter(function (x) { return x.id === it.drugId; })[0];
      if (!d || !(it.qty > 0)) return;
      var base = L.stockAt(d, vals.ts, data);
      var asOf = d.stock && d.stock.asOf > vals.ts ? d.stock.asOf : vals.ts;
      d.stock = { count: (base || 0) + it.qty, asOf: asOf };
    });
  }

  /* ---------- Onglet : Maladies ---------- */

  function viewDiseases() {
    var frag = h('div');
    frag.appendChild(h('p', { class: 'muted', text: 'Tes maladies, avec leurs symptômes habituels. L’IA s’en sert pour repérer si un symptôme que tu notes est connu pour l’une d’elles.' }));
    frag.appendChild(h('button', { class: 'btn primary block', type: 'button', text: '+ Ajouter une maladie', onclick: function () { openDiseaseForm(null); } }));
    frag.appendChild(h('div', { style: 'height:14px' }));

    if (!data.diseases.length) {
      frag.appendChild(emptyCard('heart', 'Aucune maladie renseignée pour le moment. Ajoute la première pour que l’IA repère les liens avec tes symptômes.'));
    }
    data.diseases.forEach(function (d) {
      var drugs = data.drugs.filter(function (x) { return (x.diseaseIds || []).indexOf(d.id) >= 0; });
      var card = h('button', { class: 'card tapcard', type: 'button', onclick: function () { openDiseaseForm(d); } },
        h('div', { class: 'card-head' }, icon('heart', 'neutral'),
          h('div', { class: 'ct' }, h('h3', { text: d.name }),
            d.diagnosed ? h('div', { class: 'small muted', text: 'Depuis ' + new Date(L.parseYmd(d.diagnosed) || 0).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }) : null)));
      if (d.symptoms.length) {
        card.appendChild(h('div', { class: 'lbl-small', text: 'Symptômes principaux' }));
        card.appendChild(h('div', { class: 'tags ro' }, d.symptoms.map(function (s) { return h('span', { class: 'tag', text: s }); })));
      }
      card.appendChild(h('div', { class: 'lbl-small', text: 'Traitements' }));
      card.appendChild(h('div', { class: 'small', text: drugs.length ? drugs.map(function (x) { return x.name + (x.action ? ' (' + x.action.toLowerCase() + ')' : ''); }).join(', ') : 'Aucun traitement relié.' }));
      if (d.note) card.appendChild(h('div', { class: 'small muted', style: 'margin-top:8px', text: d.note }));
      frag.appendChild(card);
    });
    return frag;
  }

  function openDiseaseForm(item) {
    var editing = !!item;
    var id = item ? item.id : L.uid();
    var name = h('input', { type: 'text', id: 'd-name', value: item ? item.name : '', placeholder: 'Ex. Migraine chronique', autocomplete: 'off', 'aria-label': 'Nom de la maladie' });
    var date = h('input', { type: 'date', id: 'd-date', value: item ? item.diagnosed : '', max: L.ymd(Date.now()), 'aria-label': 'Date du diagnostic' });
    var sym = tagEditor(item ? item.symptoms : [], 'Ajouter un symptôme', 'Nouveau symptôme');
    var note = h('textarea', { id: 'd-note', placeholder: 'Ex. suivie par le Dr Martin', 'aria-label': 'Notes', style: 'min-height:70px' });
    note.value = item ? item.note : '';

    var linked = data.drugs.filter(function (x) { return (x.diseaseIds || []).indexOf(id) >= 0; }).map(function (x) { return x.id; });
    var pending = [];
    var drugBox = h('div', { class: 'chips' });
    function drawDrugs() {
      drugBox.textContent = '';
      data.drugs.forEach(function (d) {
        var on = linked.indexOf(d.id) >= 0;
        drugBox.appendChild(h('button', {
          type: 'button', class: 'chip' + (on ? ' on' : ''), text: (on ? '✓ ' : '') + d.name, 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { var i = linked.indexOf(d.id); if (i >= 0) linked.splice(i, 1); else linked.push(d.id); drawDrugs(); }
        }));
      });
      pending.forEach(function (p, i) {
        drugBox.appendChild(h('button', { type: 'button', class: 'chip on', text: '✓ ' + p.name + ' (nouveau)', onclick: function () { pending.splice(i, 1); drawDrugs(); } }));
      });
      if (!data.drugs.length && !pending.length) drugBox.appendChild(h('span', { class: 'small muted', text: 'Aucun traitement pour le moment : ajoute-les ici ou dans l’onglet Traitements.' }));
    }
    drawDrugs();

    var suggest = h('div');
    var aiBtn = h('button', { class: 'btn block', type: 'button', text: 'Suggérer avec l’IA' });
    aiBtn.addEventListener('click', function () {
      var n = name.value.trim();
      if (!n) { toast('Écris d’abord le nom de la maladie.'); return; }
      if (!getKey()) { toast('Ajoute d’abord ta clé gratuite dans Réglages.'); return; }
      aiBtn.disabled = true;
      aiBtn.textContent = 'L’IA cherche…';
      askAI(L.buildDiseasePrompt(n), L.parseDiseaseInfo).then(function (res) {
        aiBtn.disabled = false;
        aiBtn.textContent = 'Suggérer avec l’IA';
        suggest.textContent = '';
        if (!res.symptoms.length && !res.treatments.length) { suggest.appendChild(h('div', { class: 'notice info', text: 'L’IA ne connaît pas cette maladie. Remplis les champs à la main.' })); return; }
        suggest.appendChild(h('div', { class: 'notice info', text: 'Suggestions générales de l’IA : touche ce qui te correspond, puis vérifie avec ton médecin.' }));
        if (res.symptoms.length) {
          suggest.appendChild(h('div', { class: 'lbl-small', text: 'Symptômes possibles' }));
          suggest.appendChild(h('div', { class: 'chips' }, res.symptoms.map(function (s) {
            var b = h('button', { type: 'button', class: 'chip', text: '+ ' + s });
            b.addEventListener('click', function () { sym.add(s); b.disabled = true; b.classList.add('on'); });
            return b;
          })));
        }
        if (res.treatments.length) {
          suggest.appendChild(h('div', { class: 'lbl-small', text: 'Traitements courants' }));
          suggest.appendChild(h('div', { class: 'chips' }, res.treatments.map(function (t) {
            var b = h('button', { type: 'button', class: 'chip', text: '+ ' + t.name + (t.action ? ' (' + t.action.toLowerCase() + ')' : '') });
            b.addEventListener('click', function () {
              var ex = findDrugByName(t.name);
              if (ex) { if (linked.indexOf(ex.id) < 0) linked.push(ex.id); }
              else if (!pending.some(function (p) { return L.normName(p.name) === L.normName(t.name); })) pending.push(t);
              drawDrugs(); b.disabled = true; b.classList.add('on');
            });
            return b;
          })));
        }
      }).catch(function (e) { aiBtn.disabled = false; aiBtn.textContent = 'Suggérer avec l’IA'; aiError(e); });
    });

    var body = h('div', null,
      field('Nom de la maladie', name),
      field('Date du diagnostic (facultatif)', date),
      field('Symptômes principaux (facultatif)', sym.el),
      aiBtn, suggest,
      h('div', { style: 'height:12px' }),
      field('Traitements pour cette maladie (facultatif)', drugBox),
      field('Notes (facultatif)', note),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Annuler', onclick: closeSheet }),
        h('button', {
          class: 'btn primary', type: 'button', text: 'Enregistrer', onclick: function () {
            var nm = name.value.trim();
            if (!nm) { toast('Indique le nom de la maladie.'); return; }
            var vals = { name: nm, diagnosed: date.value || '', symptoms: sym.get(), note: note.value.trim() };
            if (editing) Object.assign(item, vals); else { vals.id = id; data.diseases.push(vals); }
            data.drugs.forEach(function (d) {
              var has = d.diseaseIds.indexOf(id) >= 0, want = linked.indexOf(d.id) >= 0;
              if (want && !has) d.diseaseIds.push(id);
              if (!want && has) d.diseaseIds.splice(d.diseaseIds.indexOf(id), 1);
            });
            pending.forEach(function (p) {
              var ex = findDrugByName(p.name);
              if (ex) { if (ex.diseaseIds.indexOf(id) < 0) ex.diseaseIds.push(id); }
              else data.drugs.push(L.newDrug({ name: p.name, action: p.action, diseaseIds: [id] }));
            });
            if (save()) toast(editing ? 'Modifiée.' : 'Maladie ajoutée.');
            closeSheet(); render();
          }
        })));
    if (editing) {
      body.appendChild(h('button', {
        class: 'btn danger block', type: 'button', style: 'margin-top:10px', text: 'Supprimer cette maladie', onclick: function () {
          if (!window.confirm('Supprimer cette maladie ? Tes traitements ne sont pas supprimés.')) return;
          data.diseases.splice(data.diseases.indexOf(item), 1);
          data.drugs.forEach(function (d) { var i = d.diseaseIds.indexOf(id); if (i >= 0) d.diseaseIds.splice(i, 1); });
          save(); closeSheet(); render(); toast('Supprimée.');
        }
      }));
    }
    openSheet(editing ? 'Modifier la maladie' : 'Nouvelle maladie', body);
  }

  /* ---------- Onglet : Traitements ---------- */

  var MODE_LABEL = { sound: 'avec son', silent: 'silencieux' };

  function doseLabel(n) { return L.fmtNum(n) + (n > 1 ? ' comprimés' : ' comprimé'); }

  function stockLine(d, now) {
    var s = L.stockInfo(d, now, data);
    if (!s) return { text: 'Stock non renseigné', low: false };
    var t = L.fmtNum(s.remaining) + (s.remaining > 1 ? ' comprimés' : ' comprimé') + ' (estimation)';
    if (s.daysLeft != null) {
      t += s.daysLeft === 0 ? ' · à renouveler maintenant'
        : ' · environ ' + s.daysLeft + (s.daysLeft > 1 ? ' jours' : ' jour') + (s.lastDay != null ? ', jusqu’au ' + L.fmtDay(s.lastDay) : '');
    }
    return { text: t, low: s.low };
  }

  function viewTreatments() {
    var frag = h('div');
    var now = Date.now(), today = startOfDay(now);
    frag.appendChild(h('p', { class: 'muted', text: 'Tes traitements de fond, ce qui est dans chaque prise et ton stock. Tout est facultatif, même sans rappel.' }));

    /* Prises du jour */
    frag.appendChild(h('h2', { class: 'sec', text: 'Prises du jour' }));
    L.SLOT_KEYS.forEach(function (k) {
      var cfg = data.slots[k];
      var head = h('div', { class: 'slot-head' }, icon(k === 'morning' ? 'sun' : k === 'noon' ? 'noon' : 'moon', 'neutral'), h('h3', { text: L.SLOT_NAME[k] }),
        h('span', { class: 'small muted', text: cfg.enabled ? cfg.time.replace(':', ' h ') : 'désactivée' }));
      var card = h('div', { class: 'card' + (cfg.enabled ? '' : ' off') }, head);
      if (!cfg.enabled) {
        card.appendChild(h('button', {
          class: 'btn small', type: 'button', text: 'Activer cette prise', onclick: function () { cfg.enabled = true; save(); render(); openSlotSettings(k); }
        }));
        frag.appendChild(card);
        return;
      }
      var list = L.slotDrugs(data, k, today);
      if (!list.length) card.appendChild(h('p', { class: 'small muted', style: 'margin:8px 0', text: 'Aucun médicament dans cette prise.' }));
      list.forEach(function (x) {
        card.appendChild(h('div', { class: 'slot-line' },
          h('span', { class: 'nm', text: x.drug.name + (x.drug.strength ? ' ' + x.drug.strength : '') }),
          h('span', { class: 'small muted', text: x.label || doseLabel(x.dose) })));
      });
      if (list.length) {
        var done = L.takenOn(data, k, today);
        card.appendChild(done
          ? h('div', { class: 'slot-done' }, icon('check', 'sm'), h('span', { text: 'Faite à ' + fmtTime(done.ts) }),
              h('button', { class: 'btn small', type: 'button', text: 'Annuler', onclick: function () { L.unmarkTaken(data, k, today); save(); render(); } }))
          : h('button', { class: 'btn small block', type: 'button', style: 'margin-top:8px', text: 'Marquer comme faite', onclick: function () { markSlotDone(k, today); } }));
      }
      card.appendChild(h('div', { class: 'slot-foot' },
        h('span', { class: 'small muted', text: cfg.notify ? '🔔 Rappel ' + MODE_LABEL[cfg.mode] + (cfg.repeat ? ', répété' : '') : 'Pas de rappel' }),
        h('button', { class: 'btn small', type: 'button', text: 'Régler', onclick: function () { openSlotSettings(k); } })));
      frag.appendChild(card);
    });

    /* Liste des traitements */
    frag.appendChild(h('h2', { class: 'sec', text: 'Mes traitements' }));
    frag.appendChild(h('button', { class: 'btn primary block', type: 'button', text: '+ Ajouter un traitement', onclick: function () { openDrugForm(null); } }));
    frag.appendChild(h('div', { style: 'height:12px' }));
    if (!data.drugs.length) frag.appendChild(emptyCard('medication', 'Aucun traitement de fond renseigné. Ajoute tes médicaments pour suivre ton stock et recevoir des rappels.'));
    data.drugs.forEach(function (d) {
      var st = stockLine(d, now);
      var card = h('button', { class: 'card tapcard', type: 'button', onclick: function () { openDrugForm(d); } },
        h('div', { class: 'card-head' }, kindIcon('treatment'),
          h('div', { class: 'ct' }, h('h3', { text: d.name + (d.strength ? ' ' + d.strength : '') }),
            d.action ? h('div', { class: 'small muted', text: d.action }) : null)));
      var dn = diseaseNames(d.diseaseIds);
      if (dn.length) card.appendChild(h('div', { class: 'small muted', text: 'Pour : ' + dn.join(', ') }));
      card.appendChild(h('div', { class: 'small', style: 'margin-top:6px', text: d.slots.length ? 'Prises : ' + L.posologyText(d) : L.cleanEvery(d.every) ? 'Prise ' + L.everyText(d) + ' (choisis le moment de la journée pour activer rappels et stock)' : 'Pris si besoin : chaque prise notée retire du stock.' }));
      if (L.cleanEvery(d.every)) {
        var nd = L.nextDose(d, now, data), dd = nd == null ? null : Math.round((nd - L.startOfDay(now)) / 86400000);
        card.appendChild(h('div', { class: 'next-dose', text: nd == null ? 'Prochaine prise : traitement terminé' : 'Prochaine prise le : ' + fmtDayLong(nd) + (dd === 0 ? ' (aujourd’hui)' : dd === 1 ? ' (demain)' : '') }));
      }
      if (d.steps.length > 1) card.appendChild(h('div', { class: 'small muted', text: 'Prise progressive en ' + d.steps.length + ' étapes' }));
      var si = L.stockInfo(d, now, data);
      if (si) {
        var mv = si.daysLeft != null ? si.daysLeft : si.remaining;
        card.appendChild(h('div', { class: 'meter' + (st.low ? ' low' : ''), 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(4, Math.min(100, Math.round(mv / 30 * 100))) + '%' })));
      }
      card.appendChild(h('div', { class: 'stock' + (st.low ? ' low' : ''), text: (st.low ? '⚠ ' : '') + st.text }));
      frag.appendChild(card);
    });

    /* Pharmacie */
    frag.appendChild(h('h2', { class: 'sec', text: 'Pharmacie' }));
    var pcard = h('div', { class: 'card' });
    pcard.appendChild(h('p', { class: 'small muted', style: 'margin:0 0 10px', text: 'Note chaque passage : il apparaît en vert dans le calendrier et programme le rappel de renouvellement (21 jours pour une ordonnance mensuelle, 80 jours pour une trimestrielle).' }));
    pcard.appendChild(h('button', {
      class: 'btn primary block', type: 'button', text: 'Je suis allé à la pharmacie',
      onclick: function () { openForm('pharmacy', null, { defaultTs: Date.now() }); }
    }));
    var rem = L.pharmacyReminders(data, now);
    rem.forEach(function (r) {
      pcard.appendChild(h('div', { class: 'remind' + (r.due ? ' due' : '') },
        h('div', { class: 'nm', text: r.label.replace('Ordonnance', 'Renouvellement') + ' possible le ' + L.fmtDay(r.day) }),
        h('div', { class: 'small muted', text: (r.due ? 'Dès maintenant' : r.daysLeft === 1 ? 'Demain' : 'Dans ' + r.daysLeft + ' jours') + ' · dernier passage le ' + L.fmtDay(r.visit.ts) })));
    });
    var ps = data.pharmacySettings;
    pcard.appendChild(h('div', { class: 'slot-foot' },
      h('span', { class: 'small muted', text: ps.notify ? '🔔 Rappel à ' + ps.time.replace(':', ' h ') + ', ' + MODE_LABEL[ps.mode] : 'Pas de rappel de renouvellement' }),
      h('button', { class: 'btn small', type: 'button', text: 'Régler', onclick: openPharmacySettings })));
    frag.appendChild(pcard);

    /* Notifications à venir */
    var up = L.upcomingNotifications(data, now, 2);
    var det = h('details', { class: 'card' }, h('summary', { text: 'Prochaines notifications (' + up.length + ')' }));
    if (!up.length) det.appendChild(h('p', { class: 'small muted', text: 'Aucune notification programmée. Active un rappel dans une prise.' }));
    up.slice(0, 8).forEach(function (n) {
      det.appendChild(h('div', { class: 'slot-line' },
        h('span', { class: 'nm' }, h('span', { text: n.title }), h('span', { class: 'small muted', style: 'display:block', text: n.body })),
        h('span', { class: 'small muted', text: fmtDateTime(n.ts) })));
    });
    frag.appendChild(det);
    return frag;
  }

  function soundSelect(value) {
    return h('select', { 'aria-label': 'Son de la notification' }, SOUNDS.map(function (s) {
      return h('option', { value: s.id, text: s.label, selected: s.id === value });
    }));
  }

  function openSlotSettings(key) {
    var cfg = Object.assign({}, data.slots[key]);
    var time = h('input', { type: 'time', id: 'sl-time', value: cfg.time, 'aria-label': 'Heure' });
    var sound = soundSelect(cfg.sound);
    var repeat = h('select', { 'aria-label': 'Répéter le rappel' }, [[0, 'Ne pas répéter'], [10, 'Dans 10 minutes'], [30, 'Dans 30 minutes']].map(function (o) {
      return h('option', { value: String(o[0]), text: o[1], selected: o[0] === (cfg.repeat || 0) });
    }));
    var notifBox = h('div');
    function drawNotif() {
      notifBox.textContent = '';
      if (!cfg.notify) return;
      notifBox.appendChild(field('Heure du rappel', time));
      notifBox.appendChild(field('Type de rappel', segmented([['sound', 'Avec son'], ['silent', 'Silencieux']], cfg.mode, function (v) { cfg.mode = v; drawNotif(); })));
      if (cfg.mode === 'sound') {
        notifBox.appendChild(field('Son', h('div', { class: 'tag-input' }, sound,
          h('button', { class: 'btn small', type: 'button', text: '▶ Écouter', onclick: function () { playSound(sound.value); } }))));
      }
      notifBox.appendChild(field('Si je n’ai pas réagi', repeat));
      notifBox.appendChild(switchRow('Masquer le nom des médicaments', cfg.hideNames, function (v) { cfg.hideNames = v; }, 'La notification dit seulement « C’est l’heure de ta prise », utile si ton écran est visible par d’autres.'));
    }
    drawNotif();

    var inSlot = L.slotDrugs(data, key, L.startOfDay(Date.now()));
    var body = h('div', null,
      h('p', { class: 'small muted', text: inSlot.length ? 'Dans cette prise : ' + inSlot.map(function (x) { return x.drug.name; }).join(', ') + '.' : 'Aucun médicament dans cette prise pour le moment. Ajoute-la depuis la fiche d’un traitement.' }),
      switchRow('Prise active', cfg.enabled, function (v) { cfg.enabled = v; }, key === 'noon' ? 'Désactivée par défaut : active-la si tu as une prise le midi.' : null),
      switchRow('Me rappeler cette prise', cfg.notify, function (v) { cfg.notify = v; drawNotif(); }, 'Facultatif : tu peux renseigner tes médicaments sans rappel.'),
      notifBox,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Tester', onclick: function () {
          var list = inSlot.length ? inSlot.map(function (x) { return x.drug.name + ' ' + (x.label || L.fmtNum(x.dose)); }).join(' · ') : 'Exemple de rappel';
          var td = L.startOfDay(Date.now());
          showNotification({ title: L.SLOT_NAME[key], body: cfg.hideNames ? 'C’est l’heure de ta ' + L.SLOT_NAME[key].toLowerCase() + '.' : list, mode: cfg.mode, sound: sound.value,
            kind: 'slot', slot: key, extra: { kind: 'slot', slot: key, day: td, key: key + ':' + td, title: L.SLOT_NAME[key], body: list, mode: cfg.mode, sound: sound.value } });
        } }),
        h('button', {
          class: 'btn primary', type: 'button', text: 'Enregistrer', onclick: function () {
            cfg.time = time.value || cfg.time;
            cfg.sound = sound.value;
            cfg.repeat = Number(repeat.value) || 0;
            data.slots[key] = cfg;
            save(); closeSheet(); render(); toast('Prise enregistrée.');
          }
        })));
    openSheet(L.SLOT_NAME[key], body);
  }

  function openPharmacySettings() {
    var cfg = Object.assign({}, data.pharmacySettings);
    var time = h('input', { type: 'time', id: 'ph-time', value: cfg.time, 'aria-label': 'Heure du rappel' });
    var sound = soundSelect(cfg.sound);
    var box = h('div');
    function draw() {
      box.textContent = '';
      if (!cfg.notify) return;
      box.appendChild(field('Heure du rappel', time, 'Le rappel arrive le jour où le renouvellement devient possible.'));
      box.appendChild(field('Type de rappel', segmented([['sound', 'Avec son'], ['silent', 'Silencieux']], cfg.mode, function (v) { cfg.mode = v; draw(); })));
      if (cfg.mode === 'sound') box.appendChild(field('Son', h('div', { class: 'tag-input' }, sound, h('button', { class: 'btn small', type: 'button', text: '▶ Écouter', onclick: function () { playSound(sound.value); } }))));
    }
    draw();
    var body = h('div', null,
      switchRow('Rappel de renouvellement', cfg.notify, function (v) { cfg.notify = v; draw(); }, '21 jours après un passage pour une ordonnance mensuelle, 80 jours pour une trimestrielle.'),
      box,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Tester', onclick: function () {
          showNotification({ title: 'Renouvellement d’ordonnance', body: 'Tu peux renouveler ton ordonnance mensuelle à partir d’aujourd’hui.', mode: cfg.mode, sound: sound.value });
        } }),
        h('button', { class: 'btn primary', type: 'button', text: 'Enregistrer', onclick: function () {
          cfg.time = time.value || cfg.time; cfg.sound = sound.value;
          data.pharmacySettings = cfg; save(); closeSheet(); render(); toast('Rappel enregistré.');
        } })));
    openSheet('Rappel de renouvellement', body);
  }

  var ACTIONS = ['Anxiolytique', 'Antidouleur', 'Antidépresseur', 'Anti-inflammatoire', 'Hormone', 'Anti-acide', 'Somnifère'];

  function openDrugForm(item, prefill) {
    var editing = !!item;
    var d = item ? JSON.parse(JSON.stringify(item)) : L.newDrug(prefill || {});
    var now = Date.now();
    var slots = d.slots.slice();
    var steps = d.steps.map(function (s) { return { until: s.until || '', doses: Object.assign({}, s.doses), dose: s.dose || '' }; });
    var mode = steps.length > 1 ? 'progressive' : 'fixed';
    var diseaseIds = d.diseaseIds.slice();
    var every = L.cleanEvery(d.every) || { n: 2, unit: 'days', from: L.ymd(Date.now()) };
    var everyOn = !!L.cleanEvery(d.every);

    var name = h('input', { type: 'text', id: 'm-name', value: d.name, placeholder: 'Ex. Sertraline', autocomplete: 'off', 'aria-label': 'Nom du médicament' });
    /* Dosage : nombre + unité sur le côté (g en haut, mg par défaut, µg) */
    var UNITS = ['g', 'mg', 'µg'];
    var sm = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(.*?)\s*$/.exec(d.strength || '');
    var sNum = sm ? sm[1].replace(',', '.') : '';
    var sUnit = sm ? (sm[2] === 'mcg' ? 'µg' : sm[2]) : 'mg';
    var sRaw = d.strength && !sm ? d.strength : '';
    var strNum = h('input', { type: 'number', id: 'm-strength', inputmode: 'decimal', min: '0', step: 'any', value: sNum, placeholder: 'Ex. 50', autocomplete: 'off', 'aria-label': 'Dosage du comprimé' });
    var unitSel = h('select', { id: 'm-unit', 'aria-label': 'Unité du dosage' },
      UNITS.concat(sUnit && UNITS.indexOf(sUnit) < 0 ? [sUnit] : []).map(function (u) {
        var o = h('option', { value: u, text: u }); if (u === (sUnit || 'mg')) o.selected = true; return o;
      }));
    var strength = {
      el: h('div', { class: 'strength-row' }, strNum, unitSel),
      get: function () {
        var n = strNum.value.trim();
        if (n === '') return sRaw;
        return n.replace('.', ',') === n ? n + ' ' + unitSel.value : n.replace('.', ',') + ' ' + unitSel.value;
      }
    };
    var action = h('input', { type: 'text', id: 'm-action', value: d.action, placeholder: 'Ex. Anxiolytique', autocomplete: 'off', 'aria-label': 'Action du médicament' });
    var actionChips = h('div', { class: 'chips' }, ACTIONS.map(function (a) {
      return h('button', { type: 'button', class: 'chip', text: a, onclick: function () { action.value = a; } });
    }));
    var side = tagEditor(d.sideEffects, 'Ajouter un effet (ex. nausées)', 'Nouvel effet indésirable');
    var initialStock = item ? L.stockAt(item, now, data) : null;
    var stock = h('input', { type: 'number', id: 'm-stock', inputmode: 'decimal', min: '0', step: '1', value: initialStock != null ? String(initialStock) : '', placeholder: 'Ex. 28', 'aria-label': 'Comprimés restants' });
    var note = h('textarea', { id: 'm-note', placeholder: 'Ex. à prendre avec un repas', 'aria-label': 'Notes', style: 'min-height:64px' });
    note.value = d.note;

    var diseaseBox = h('div', { class: 'chips' });
    function drawDiseases() {
      diseaseBox.textContent = '';
      data.diseases.forEach(function (x) {
        var on = diseaseIds.indexOf(x.id) >= 0;
        diseaseBox.appendChild(h('button', {
          type: 'button', class: 'chip' + (on ? ' on' : ''), text: (on ? '✓ ' : '') + x.name, 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { var i = diseaseIds.indexOf(x.id); if (i >= 0) diseaseIds.splice(i, 1); else diseaseIds.push(x.id); drawDiseases(); }
        }));
      });
      if (!data.diseases.length) diseaseBox.appendChild(h('span', { class: 'small muted', text: 'Ajoute d’abord tes maladies dans l’onglet Maladies.' }));
    }
    drawDiseases();

    var aiBtn = h('button', { class: 'btn block', type: 'button', text: 'Compléter avec l’IA (action, effets indésirables)' });
    aiBtn.addEventListener('click', function () {
      var n = name.value.trim();
      if (!n) { toast('Écris d’abord le nom du médicament.'); return; }
      if (!getKey()) { toast('Ajoute d’abord ta clé gratuite dans Réglages.'); return; }
      aiBtn.disabled = true;
      aiBtn.textContent = 'L’IA cherche…';
      askAI(L.buildDrugPrompt(n), L.parseDrugInfo).then(function (res) {
        aiBtn.disabled = false;
        aiBtn.textContent = 'Compléter avec l’IA (action, effets indésirables)';
        if (!res.action && !res.sideEffects.length) { toast('L’IA ne connaît pas ce médicament. Remplis à la main.'); return; }
        if (res.action && !action.value.trim()) action.value = res.action;
        res.sideEffects.forEach(side.add);
        res.diseases.forEach(function (dn) {
          var k = L.normName(dn);
          data.diseases.forEach(function (x) {
            var xn = L.normName(x.name);
            if ((xn.indexOf(k) >= 0 || k.indexOf(xn) >= 0) && diseaseIds.indexOf(x.id) < 0) diseaseIds.push(x.id);
          });
        });
        drawDiseases();
        toast('Rempli par l’IA : vérifie et corrige si besoin.');
      }).catch(function (e) { aiBtn.disabled = false; aiBtn.textContent = 'Compléter avec l’IA (action, effets indésirables)'; aiError(e); });
    });

    /* Prises et posologie */
    var poso = h('div');
    function ensureDoses() {
      steps.forEach(function (st) { slots.forEach(function (k) { if (st.doses[k] == null) st.doses[k] = 1; }); });
    }
    function doseInputs(st) {
      var row = h('div', { class: 'dose-grid' });
      L.SLOT_KEYS.forEach(function (k) {
        if (slots.indexOf(k) < 0) return;
        var inp = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.25', value: String(st.doses[k] != null ? st.doses[k] : 1), 'aria-label': 'Comprimés ' + L.SLOT_SHORT[k] });
        inp.addEventListener('input', function () { var n = num(inp.value); st.doses[k] = n == null ? 0 : n; });
        function bump(delta) {
          var n = num(inp.value); n = Math.max(0, Math.round(((n == null ? 0 : n) + delta) * 4) / 4);
          inp.value = String(n); st.doses[k] = n;
        }
        row.appendChild(h('label', { class: 'dose-cell' }, h('span', { class: 'small muted', text: L.SLOT_SHORT[k][0].toUpperCase() + L.SLOT_SHORT[k].slice(1) }),
          h('span', { class: 'stepper' },
            h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Moins ' + L.SLOT_SHORT[k], text: '−', onclick: function (e) { e.preventDefault(); bump(-0.5); } }),
            inp,
            h('button', { type: 'button', class: 'step-btn', 'aria-label': 'Plus ' + L.SLOT_SHORT[k], text: '+', onclick: function (e) { e.preventDefault(); bump(0.5); } }))));
      });
      return row;
    }
    /* Prise progressive : on indique la dose (ex. 25 mg), en comptant une gélule par prise */
    function doseAmountInput(st) {
      var m = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(.*?)\s*$/.exec(st.dose || '');
      var sm2 = /^\s*[0-9.,]+\s*(.*?)\s*$/.exec(strength.get() || '');
      var u0 = m ? (m[2] === 'mcg' ? 'µg' : m[2]) : (sm2 && sm2[1]) || 'mg';
      var numI = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: m ? m[1].replace(',', '.') : '', placeholder: 'Ex. 25', 'aria-label': 'Dose de cette étape' });
      var us = h('select', { 'aria-label': 'Unité de la dose' }, UNITS.concat(UNITS.indexOf(u0) < 0 ? [u0] : []).map(function (u) {
        var o = h('option', { value: u, text: u }); if (u === u0) o.selected = true; return o;
      }));
      function upd() { var n = numI.value.trim(); st.dose = n === '' ? '' : n.replace('.', ',') + ' ' + us.value; }
      numI.addEventListener('input', upd); us.addEventListener('change', upd);
      return h('div', { class: 'strength-row' }, numI, us);
    }
    function drawPoso() {
      poso.textContent = '';
      var chips = h('div', { class: 'chips' });
      L.SLOT_KEYS.forEach(function (k) {
        var enabled = data.slots[k].enabled || slots.indexOf(k) >= 0;
        if (!enabled) return;
        var on = slots.indexOf(k) >= 0;
        chips.appendChild(h('button', {
          type: 'button', class: 'chip' + (on ? ' on' : ''), text: (on ? '✓ ' : '') + L.SLOT_NAME[k], 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { var i = slots.indexOf(k); if (i >= 0) slots.splice(i, 1); else slots.push(k); ensureDoses(); drawPoso(); }
        }));
      });
      poso.appendChild(field('Dans quelle(s) prise(s) ?', chips, data.slots.noon.enabled ? null : 'Pour ajouter une prise du midi, active-la dans l’onglet Traitements.'));
      if (!slots.length) {
        poso.appendChild(h('p', { class: 'small muted', text: 'Aucune prise régulière : médicament pris à la demande, ou pas encore réglé.' }));
        return;
      }
      poso.appendChild(field('Posologie', segmented([['fixed', 'Dose fixe'], ['progressive', 'Prise progressive']], mode, function (v) {
        mode = v;
        if (mode === 'fixed') steps = [{ until: '', doses: steps[0].doses, dose: '' }];
        else if (steps.length < 2) { steps[0].until = L.ymd(L.addDays(Date.now(), 14)); steps.push({ until: '', doses: Object.assign({}, steps[0].doses), dose: steps[0].dose || '' }); }
        drawPoso();
      })));
      if (mode === 'fixed') {
        poso.appendChild(field('Comprimés par prise', doseInputs(steps[0])));
        return;
      }
      poso.appendChild(h('p', { class: 'small muted', text: 'Pour un début de traitement : indique chaque dose et jusqu’à quelle date elle dure. La dernière étape n’a pas de date de fin.' }));
      steps.forEach(function (st, i) {
        var last = i === steps.length - 1;
        var card = h('div', { class: 'step-card' }, h('div', { class: 'med-head' },
          h('strong', { text: 'Étape ' + (i + 1) + (last ? ' (ensuite)' : '') }),
          steps.length > 2 || !last ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Retirer l’étape ' + (i + 1), text: '✕', onclick: function () {
            steps.splice(i, 1); steps[steps.length - 1].until = ''; if (steps.length < 2) mode = 'fixed'; drawPoso();
          } }) : null));
        card.appendChild(field('Dose par prise', doseAmountInput(st), 'Compté comme une gélule par prise pour le stock.'));
        if (!last) {
          var u = h('input', { type: 'date', value: st.until, 'aria-label': 'Jusqu’au (inclus)' });
          u.addEventListener('input', function () { st.until = u.value; });
          card.appendChild(field('Jusqu’au (inclus)', u));
        }
        poso.appendChild(card);
      });
      poso.appendChild(h('button', { class: 'btn small', type: 'button', text: '+ Ajouter une étape', onclick: function () {
        var prev = steps[steps.length - 1];
        var lastDated = steps.length > 1 ? L.parseYmd(steps[steps.length - 2].until) : null;
        prev.until = L.ymd(L.addDays(lastDated != null ? lastDated : Date.now(), 14));
        steps.push({ until: '', doses: Object.assign({}, prev.doses), dose: '' });
        drawPoso();
      } }));
    }
    ensureDoses();
    drawPoso();

    /* Prise intermittente : « tous les [n] [jours|semaines|mois|ans] » */
    var everyBox = h('div', { class: 'every-box' });
    function drawEvery() {
      everyBox.textContent = '';
      var cb = h('input', { type: 'checkbox', id: 'm-every-on', checked: everyOn });
      cb.addEventListener('change', function () { everyOn = cb.checked; drawEvery(); });
      everyBox.appendChild(h('label', { class: 'check-row' }, cb, h('span', { text: 'Prise intermittente' })));
      if (!everyOn) return;
      var n = h('input', { type: 'number', id: 'm-every-n', inputmode: 'numeric', min: '1', max: '999', step: '1', value: String(every.n), 'aria-label': 'Nombre', class: 'every-n' });
      n.addEventListener('input', function () { var v = Math.floor(Number(n.value)); if (isFinite(v) && v >= 1) every.n = v; });
      var u = h('select', { id: 'm-every-unit', 'aria-label': 'Unité' });
      [['days', 'jours'], ['weeks', 'semaines'], ['months', 'mois'], ['years', 'ans']].forEach(function (o) {
        var op = h('option', { value: o[0], text: o[1] }); if (o[0] === every.unit) op.selected = true; u.appendChild(op);
      });
      u.addEventListener('change', function () { every.unit = u.value; });
      var from = h('input', { type: 'date', id: 'm-every-from', value: every.from, 'aria-label': 'Première prise le' });
      from.addEventListener('input', function () { if (from.value) every.from = from.value; });
      everyBox.appendChild(h('div', { class: 'every-row' }, h('span', { text: 'Tous les' }), n, u));
      everyBox.appendChild(field('Prise de référence (une prise a lieu ce jour-là)', from, 'Le stock et les rappels suivent ce rythme.'));
    }
    drawEvery();

    function save1() {
      var nm = name.value.trim();
      if (!nm) { toast('Indique le nom du médicament.'); return; }
      var other = findDrugByName(nm);
      if (other && (!editing || other.id !== item.id)) { toast('Ce traitement existe déjà.'); return; }
      var cleaned = steps.map(function (st) {
        var doses = {};
        var withDose = mode === 'progressive' && st.dose;
        slots.forEach(function (k) { doses[k] = withDose ? 1 : (st.doses[k] != null ? st.doses[k] : 0); });
        return { until: st.until || '', doses: doses, dose: mode === 'progressive' ? (st.dose || '') : '' };
      });
      if (mode === 'progressive' && slots.length) {
        var prevU = null;
        for (var i = 0; i < cleaned.length - 1; i++) {
          var u = L.parseYmd(cleaned[i].until);
          if (u == null) { toast('Indique la date de fin de l’étape ' + (i + 1) + '.'); return; }
          if (prevU != null && u <= prevU) { toast('Les dates des étapes doivent se suivre dans l’ordre.'); return; }
          prevU = u;
        }
        cleaned[cleaned.length - 1].until = '';
      } else cleaned = [{ until: '', doses: cleaned[0].doses, dose: '' }];
      var vals = {
        name: nm, strength: strength.get(), action: action.value.trim(), diseaseIds: diseaseIds.slice(),
        slots: slots.slice(), steps: cleaned, sideEffects: side.get(), note: note.value.trim(),
        stock: item ? item.stock : null,
        every: everyOn ? L.cleanEvery(every) : null
      };
      if (everyOn && !vals.every) { toast('Indique un nombre de 1 ou plus.'); return; }
      var sv = num(stock.value);
      if (stock.value.trim() === '') vals.stock = null;
      else if (sv != null && sv !== initialStock) vals.stock = { count: sv, asOf: Date.now() };
      if (editing) Object.assign(item, vals); else { vals.id = L.uid(); data.drugs.push(L.newDrug(vals)); }
      if (save()) toast(editing ? 'Traitement modifié.' : 'Traitement ajouté.');
      closeSheet(); render();
    }

    var body = h('div', null,
      field('Nom du médicament', name),
      aiBtn,
      h('div', { style: 'height:12px' }),
      field('Dosage du comprimé (facultatif)', strength.el),
      field('Action du médicament (facultatif)', h('div', null, action, actionChips)),
      field('Pour quelle(s) maladie(s) ? (facultatif)', diseaseBox),
      poso,
      everyBox,
      field('Comprimés que j’ai (facultatif)', h('div', null, stock, h('div', { class: 'chips quick-qty' }, [14, 28, 30, 56, 60, 90].map(function (n) {
        return h('button', { type: 'button', class: 'chip', text: String(n), onclick: function () { stock.value = String(n); } });
      }))), 'Le stock diminue tout seul selon ta posologie et à chaque prise « si besoin » que tu notes (nombre de comprimés pris) : c’est une estimation. Corrige-le quand tu recomptes.'),
      field('Effets indésirables possibles (facultatif)', side.el, 'Utilisés pour repérer si un symptôme que tu notes pourrait venir de ce médicament.'),
      field('Notes (facultatif)', note),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: 'Annuler', onclick: closeSheet }),
        h('button', { class: 'btn primary', type: 'button', text: 'Enregistrer', onclick: save1 })));
    if (editing) {
      body.appendChild(h('button', {
        class: 'btn danger block', type: 'button', style: 'margin-top:10px', text: 'Supprimer ce traitement', onclick: function () {
          if (!window.confirm('Supprimer ce traitement ?')) return;
          data.drugs.splice(data.drugs.indexOf(item), 1);
          save(); closeSheet(); render(); toast('Supprimé.');
        }
      }));
    }
    openSheet(editing ? 'Modifier le traitement' : 'Nouveau traitement', body);
  }

  /* ---------- Analyse : causes possibles par symptôme ---------- */

  function kindOfCause(k) { return k === 'disease' ? icon('heart', 'neutral sm') : k === 'drug' ? kindIcon('treatment', 'sm') : kindIcon('medication', 'sm'); }

  var CAUSE_LABEL = { disease: 'Maladie', drug: 'Traitement de fond', occasional: 'Médicament occasionnel' };

  function causesSection(frag) {
    L.updateCauses(data, Date.now(), data.settings.windowHours || 6);
    var keys = Object.keys(data.causes).sort(function (a, b) { return data.causes[b].count - data.causes[a].count; });
    frag.appendChild(h('h2', { class: 'sec', text: 'Causes possibles par symptôme' }));
    frag.appendChild(h('p', { class: 'muted', text: 'Pour chaque symptôme noté, les pistes trouvées dans tes maladies et tes médicaments. Elles sont mises à jour automatiquement et conservées ici.' }));
    if (!keys.length) frag.appendChild(emptyCard('symptom', 'Note un symptôme : ses causes possibles apparaîtront ici.'));
    keys.forEach(function (k) {
      var c = data.causes[k];
      var card = h('div', { class: 'card' },
        h('div', { class: 'med-head' }, h('h3', { text: c.symptom }), h('span', { class: 'small muted', text: 'noté ' + c.count + (c.count > 1 ? ' fois' : ' fois') })),
        h('div', { class: 'small muted', text: 'Dernière fois : ' + fmtDateTime(c.last) }));
      if (!c.items.length) {
        card.appendChild(h('p', { class: 'small', style: 'margin:10px 0 0', text: 'Aucun lien trouvé avec tes maladies ou tes traitements. Pense au sommeil, au stress, à l’alimentation, et parles-en à ton médecin si ça se répète.' }));
      }
      function causeRow(it) {
        return h('div', { class: 'cause' },
          kindOfCause(it.kind),
          h('div', { class: 'cx' },
            h('div', { class: 'top' }, h('span', { class: 'nm', text: it.label }), h('span', { class: 'badge none', text: CAUSE_LABEL[it.kind] })),
            h('div', { class: 'small muted', text: it.why })));
      }
      c.items.slice(0, 4).forEach(function (it) { card.appendChild(causeRow(it)); });
      if (c.items.length > 4) {
        var more = h('details', { class: 'more' }, h('summary', { text: 'Voir ' + (c.items.length - 4) + ' autre' + (c.items.length - 4 > 1 ? 's' : '') + ' piste' + (c.items.length - 4 > 1 ? 's' : '') }));
        c.items.slice(4).forEach(function (it) { more.appendChild(causeRow(it)); });
        card.appendChild(more);
      }
      if (c.aiNote) {
        card.appendChild(h('div', { class: 'answer' }, h('div', { class: 'small muted', text: 'Avis de l’IA du ' + L.fmtDay(c.aiNote.at) }), c.aiNote.text));
      }
      var btn = h('button', { class: 'btn small', type: 'button', text: c.aiNote ? 'Actualiser l’avis de l’IA' : 'Demander l’avis de l’IA', style: 'margin-top:10px' });
      btn.addEventListener('click', function () {
        if (!getKey()) { toast('Ajoute d’abord ta clé gratuite dans Réglages.'); return; }
        btn.disabled = true; btn.textContent = 'L’IA réfléchit…';
        askAI(L.buildAdvicePrompt(c.symptom, data, Date.now()), L.parseAdvice).then(function (text) {
          if (data.causes[k]) data.causes[k].aiNote = { text: text, at: Date.now() };
          save(); render();
        }).catch(function (e) { btn.disabled = false; btn.textContent = 'Demander l’avis de l’IA'; aiError(e); });
      });
      card.appendChild(btn);
      frag.appendChild(card);
    });
  }

  /* ---------- Rendu général ---------- */

  function go(tab) {
    ui.tab = tab;
    ui.animate = true;
    if (tab === 'chat') ui.stickBottom = true;
    render();
    if (tab !== 'chat') window.scrollTo(0, 0);
  }

  var AMBIANCES = [
    { id: 'nuit', name: 'Nuit néon', c: '#6d7dff' },
    { id: '', name: 'Neutre', c: '#8a8a8f' },
    { id: 'ardoise', name: 'Ardoise', c: '#5b7aa6' },
    { id: 'sable', name: 'Sable', c: '#b08a5b' },
    { id: 'sauge', name: 'Sauge', c: '#6f9a82' },
    { id: 'prune', name: 'Prune', c: '#8f6aa8' }
  ];
  function applyAmbiance() {
    var a = data.settings.ambiance == null ? 'nuit' : data.settings.ambiance;
    if (a) document.documentElement.setAttribute('data-ambiance', a); else document.documentElement.removeAttribute('data-ambiance');
  }

  function render() {
    var view = document.getElementById('view');
    var scroll = window.scrollY;
    view.textContent = '';
    var content = ui.tab === 'calendar' ? viewCalendar()
      : ui.tab === 'diseases' ? viewDiseases()
      : ui.tab === 'treatments' ? viewTreatments()
      : ui.tab === 'analysis' ? viewAnalysis()
      : ui.tab === 'settings' ? viewSettings()
      : viewChat();
    view.appendChild(content);
    view.classList.toggle('rise', !!ui.animate);
    ui.animate = false;
    document.getElementById('title').textContent = TITLES[ui.tab];
    var sub = fmtDayLong(Date.now());
    document.getElementById('subtitle').textContent = sub.charAt(0).toUpperCase() + sub.slice(1);
    Array.prototype.forEach.call(document.querySelectorAll('#tabbar button'), function (b) {
      var on = b.getAttribute('data-tab') === ui.tab;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });

    var chatOn = ui.tab === 'chat';
    document.getElementById('composer').hidden = !chatOn;
    document.body.classList.toggle('chat-on', chatOn);
    if (chatOn) updateComposerSpace();

    if (chatOn && ui.stickBottom) {
      ui.stickBottom = false;
      window.scrollTo(0, document.body.scrollHeight);
    } else if (ui.tab === 'calendar' && ui.scrollPanel) {
      ui.scrollPanel = false;
      window.scrollTo(0, scroll);
      var p = document.getElementById('day-panel');
      if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      window.scrollTo(0, scroll);
    }
  }

  document.getElementById('tabbar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    go(b.getAttribute('data-tab'));
  });

  document.getElementById('chat-form').addEventListener('submit', function (e) { e.preventDefault(); submitChat(); });
  document.getElementById('chat-input').addEventListener('input', autoGrow);
  document.getElementById('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitChat(); }
  });

  window.__suiviResched = scheduleNotifications;
  (window.__suiviPending || []).splice(0).forEach(function (p) { handleNotifAction(p.actionId, p.extra); });
  applyAmbiance();
  buildQuickAdd();
  render();
  scheduleNotifications();
})();
