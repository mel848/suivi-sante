/* Notifications réelles (APK Android) : confiées au système via le plugin Capacitor « Local Notifications ».
   Dans un navigateur ou dans la démo, ce fichier ne fait rien. */
(function () {
  'use strict';
  var C = window.Capacitor;
  /* Renseigne l'écran « Rappels sur ce téléphone » (Réglages) si le module ne démarre pas */
  var info = window.__nativeInfo = { loaded: true, cap: !!C, platform: '', native: false, err: '' };
  if (!C) return;
  try { info.platform = C.getPlatform ? String(C.getPlatform()) : ''; } catch (e) { /* sans importance */ }
  try { info.native = !!(C.isNativePlatform && C.isNativePlatform()) || (!!info.platform && info.platform !== 'web'); } catch (e) { /* sans importance */ }
  if (!info.native) return;
  var LN;
  /* Sans outil de compilation, Capacitor ne fournit pas toujours registerPlugin : on prend alors le plugin déjà déclaré par l'application */
  try { LN = C.registerPlugin ? C.registerPlugin('LocalNotifications') : (C.Plugins && C.Plugins.LocalNotifications); } catch (e) { info.err = String(e && e.message || e); }
  if (!LN) { if (!info.err) info.err = 'plugin LocalNotifications introuvable'; return; }

  var SOUNDS = ['carillon', 'doux', 'cloche', 'digital', 'radar'];
  var LABEL = { carillon: 'Carillon', doux: 'Doux', cloche: 'Cloche', digital: 'Digital', radar: 'Radar' };
  var ready = null;
  var queue = Promise.resolve();

  function channelFor(mode, sound) { return mode === 'sound' ? 'rap_' + (SOUNDS.indexOf(sound) >= 0 ? sound : 'carillon') : 'silencieux'; }

  var lastErr = '';
  function note(e) { lastErr = (e && (e.message || e.errorMessage)) ? String(e.message || e.errorMessage) : String(e || ''); }

  /* Autorisation : revérifiée à chaque fois (l'utilisateur peut la changer dans les réglages du téléphone) */
  function ensurePermission() {
    return LN.checkPermissions().then(function (p) { return p.display === 'granted' ? p : LN.requestPermissions(); });
  }

  function setup() {
    var perm = ensurePermission().catch(function (e) { note(e); });
    if (!ready) {
      ready = perm.then(function () {
        var jobs = [LN.createChannel({ id: 'silencieux', name: 'Rappels silencieux', description: 'Rappels sans son', importance: 2, visibility: 0, vibration: false })];
        SOUNDS.forEach(function (s) {
          /* importance 5 = alerte maximale : fenêtre qui s'affiche par-dessus l'écran ; visibilité 1 = contenu lisible sur l'écran de verrouillage */
          jobs.push(LN.createChannel({ id: 'rap_' + s, name: 'Rappels de prise : ' + LABEL[s], description: 'Rappel bien visible avec le son « ' + LABEL[s] + ' »', importance: 5, visibility: 1, vibration: true, lights: true, sound: s + '.wav' }));
          /* anciens canaux (réglage plus discret, non modifiable une fois créé) */
          jobs.push(LN.deleteChannel ? LN.deleteChannel({ id: 'son_' + s }).catch(function () { /* sans importance */ }) : null);
        });
        jobs.push(LN.registerActionTypes({ types: [{ id: 'PRISE', actions: [{ id: 'fait', title: 'Fait' }, { id: 'reporter', title: 'Reporter' }] }] }));
        return Promise.all(jobs);
      }).catch(function (e) { note(e); });
    }
    return Promise.all([perm, ready]);
  }

  function build(n, id, at) {
    var o = {
      id: id, title: n.title, body: n.body, largeBody: n.body, channelId: channelFor(n.mode, n.sound),
      smallIcon: 'ic_stat_pill', iconColor: '#6d7dff',
      schedule: { at: new Date(at), allowWhileIdle: true }
    };
    if (n.kind === 'slot' && n.extra) { o.actionTypeId = 'PRISE'; o.extra = n.extra; }
    return o;
  }

  function cancelByKey(key) {
    return LN.getPending().then(function (p) {
      var ids = ((p && p.notifications) || []).filter(function (x) { return x.extra && x.extra.key === key; }).map(function (x) { return { id: x.id }; });
      return ids.length ? LN.cancel({ notifications: ids }) : null;
    });
  }

  /* Appui sur « Fait » / « Reporter » : transmis à l'application (mis en attente si elle démarre à peine) */
  try {
    LN.addListener('localNotificationActionPerformed', function (ev) {
      var extra = ev && ev.notification && ev.notification.extra;
      if (!extra || ev.actionId === 'tap') return;
      if (window.__suiviNotifAction) window.__suiviNotifAction(ev.actionId, extra);
      else (window.__suiviPending = window.__suiviPending || []).push({ actionId: ev.actionId, extra: extra });
    });
  } catch (e) { /* sans importance */ }

  window.SuiviNotif = {
    /* Programme les prochaines notifications (remplace les précédentes) */
    schedule: function (list) {
      var run = function () {
        return setup().then(function () {
          return LN.getPending().then(function (p) {
            /* les rappels « reportés » restent en place : ils ne font pas partie de la programmation normale */
            var pend = ((p && p.notifications) || []).filter(function (x) { return !(x.extra && x.extra.snooze); });
            return pend.length ? LN.cancel({ notifications: pend.map(function (x) { return { id: x.id }; }) }) : null;
          }).catch(function (e) { note(e); });
        }).then(function () {
          var out = [], id = 1;
          (list || []).forEach(function (n) {
            out.push(build(n, id++, n.ts));
            if (n.repeat) out.push(build(n, id++, n.ts + n.repeat * 60000));
          });
          return out.length ? LN.schedule({ notifications: out.slice(0, 60) }) : null;
        }).then(function () { lastErr = ''; }).catch(function (e) { note(e); });
      };
      queue = queue.then(run, run);
      return queue;
    },
    /* « Reporter » : même rappel dans N minutes (et on retire le rappel répété du même moment) */
    snooze: function (extra, minutes) {
      var at = Date.now() + minutes * 60000;
      setup().then(function () { return cancelByKey(extra.key); }).then(function () {
        return LN.schedule({ notifications: [build({ kind: 'slot', title: extra.title, body: extra.body, mode: extra.mode, sound: extra.sound, extra: Object.assign({}, extra, { snooze: true }) }, 998000 + Math.floor(Math.random() * 999), at)] });
      }).catch(function () { /* sans importance */ });
    },
    /* « Fait » : on retire les rappels encore en attente pour cette prise */
    cancelKey: function (key) { setup().then(function () { return cancelByKey(key); }).catch(function () { /* sans importance */ }); },
    /* État des rappels, pour l'écran « Rappels sur ce téléphone » dans Réglages */
    diagnose: function () {
      var out = { perm: '?', exact: '', pending: [], err: '' };
      return Promise.resolve()
        .then(function () { return LN.checkPermissions(); }).then(function (p) { out.perm = p.display; }, function (e) { note(e); })
        .then(function () { return LN.checkExactNotificationSetting ? LN.checkExactNotificationSetting() : null; })
        .then(function (x) { if (x) out.exact = x.exact_alarm; }, function () { /* ancienne version du plugin */ })
        .then(function () { return LN.getPending(); })
        .then(function (p) {
          out.pending = ((p && p.notifications) || []).map(function (x) {
            var at = x.schedule && x.schedule.at ? new Date(x.schedule.at).getTime() : 0;
            return { at: at, title: x.title || '' };
          }).filter(function (x) { return x.at; }).sort(function (a, b) { return a.at - b.at; });
        }, function (e) { note(e); })
        .then(function () { out.err = lastErr; return out; });
    },
    askPermission: function () { return ensurePermission().then(function (p) { return p.display; }, function (e) { note(e); return 'denied'; }); },
    askExact: function () {
      return Promise.resolve().then(function () { return LN.changeExactNotificationSetting ? LN.changeExactNotificationSetting() : null; }).catch(function (e) { note(e); });
    },
    /* Bouton « Tester » : notification dans une seconde */
    show: function (n) {
      setup().then(function () {
        return LN.schedule({ notifications: [build(n, 999000 + Math.floor(Math.random() * 999), Date.now() + 1200)] });
      }).catch(function () { /* sans importance */ });
    }
  };

  /* Au retour dans l'application : on reprogramme (les notifications couvrent 7 jours) */
  document.addEventListener('visibilitychange', function () { if (!document.hidden && window.__suiviResched) window.__suiviResched(); });
})();
