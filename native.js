/* Notifications réelles (APK Android) : confiées au système via le plugin Capacitor « Local Notifications ».
   Dans un navigateur ou dans la démo, ce fichier ne fait rien. */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var LN;
  try { LN = C.registerPlugin('LocalNotifications'); } catch (e) { return; }

  var SOUNDS = ['carillon', 'doux', 'cloche', 'digital', 'radar'];
  var LABEL = { carillon: 'Carillon', doux: 'Doux', cloche: 'Cloche', digital: 'Digital', radar: 'Radar' };
  var ready = null;

  function channelFor(mode, sound) { return mode === 'sound' ? 'son_' + (SOUNDS.indexOf(sound) >= 0 ? sound : 'carillon') : 'silencieux'; }

  function setup() {
    if (ready) return ready;
    ready = Promise.resolve()
      .then(function () { return LN.checkPermissions(); })
      .then(function (p) { return p.display === 'granted' ? p : LN.requestPermissions(); })
      .then(function () {
        var jobs = [LN.createChannel({ id: 'silencieux', name: 'Rappels silencieux', description: 'Rappels sans son', importance: 2, visibility: 0, vibration: false })];
        SOUNDS.forEach(function (s) {
          jobs.push(LN.createChannel({ id: 'son_' + s, name: 'Rappels avec son : ' + LABEL[s], description: 'Rappels avec le son « ' + LABEL[s] + ' »', importance: 4, visibility: 0, vibration: true, sound: s + '.wav' }));
        });
        return Promise.all(jobs);
      })
      .catch(function () { /* autorisation refusée : les rappels ne seront pas envoyés */ });
    return ready;
  }

  function build(n, id, at) {
    return {
      id: id, title: n.title, body: n.body, channelId: channelFor(n.mode, n.sound),
      smallIcon: 'ic_stat_pill', iconColor: '#6d7dff',
      schedule: { at: new Date(at), allowWhileIdle: true }
    };
  }

  window.SuiviNotif = {
    /* Programme les prochaines notifications (remplace les précédentes) */
    schedule: function (list) {
      setup().then(function () {
        return LN.getPending();
      }).then(function (p) {
        var pend = (p && p.notifications) || [];
        return pend.length ? LN.cancel({ notifications: pend.map(function (x) { return { id: x.id }; }) }) : null;
      }).then(function () {
        var out = [], id = 1;
        (list || []).forEach(function (n) {
          out.push(build(n, id++, n.ts));
          if (n.repeat) out.push(build(n, id++, n.ts + n.repeat * 60000));
        });
        return out.length ? LN.schedule({ notifications: out.slice(0, 60) }) : null;
      }).catch(function () { /* sans importance */ });
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
