/* Assemble la démo : un seul fichier HTML avec l'application réelle, les données d'exemple et l'IA simulée. */
var fs = require('fs'), path = require('path');
var root = __dirname;
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
var html = read('index.html');
var bodyInner = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="logic.js">')).trim();
var out = [
  '<title>Suivi Santé</title>',
  '<meta name="theme-color" content="#121212">',
  '<style>', read('style.css'), read('demo/demo.css'), '</style>',
  '<div class="demo-bar"><span><strong>Démo</strong> · données fictives, IA simulée, rien n’est conservé</span><button id="demo-reset" type="button">Remettre à zéro</button></div>',
  bodyInner,
  '<div id="demo-notif" role="status" aria-live="polite"><div class="app"><span>Suivi Santé</span><span class="m"></span></div><div class="t"></div><div class="b"></div><div class="acts"></div></div>',
  '<script>', read('logic.js'), '</script>',
  '<script>', read('demo/ai.js'), '</script>',
  '<script>', read('demo/harness.js'), '</script>',
  '<script>', read('app.js'), '</script>',
  '<script>document.getElementById("demo-reset").addEventListener("click", function () { location.reload(); });</script>'
].join('\n');
fs.writeFileSync(process.argv[2] || path.join(root, 'demo/demo.html'), out);
console.log('ok', out.length);
