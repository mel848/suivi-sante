# suivi-sante
# Suivi Santé : obtenir ton lien APK avec GitHub

Durée : environ 15 minutes, sans rien installer. Tout se fait dans le navigateur
(ordinateur recommandé, mais un téléphone en « version pour ordinateur » marche aussi).

## 1. Créer un compte GitHub
Va sur https://github.com/signup et crée un compte gratuit (si tu n'en as pas déjà un).

## 2. Créer le dépôt
1. En haut à droite, clique sur **+** puis **New repository**.
2. Nom : `suivi-sante`.
3. Choisis **Public** (nécessaire pour que le lien de téléchargement marche sans connexion).
   Aucune donnée de santé n'est dans ce dépôt : tes notes restent sur ton téléphone,
   et ta clé IA n'est jamais envoyée sur GitHub.
4. Coche **Add a README file**, puis **Create repository**.

## 3. Envoyer les fichiers
1. Dézippe le dossier que je t'ai donné.
2. Sur la page du dépôt : **Add file** puis **Upload files**.
3. Glisse-dépose **tous** les fichiers et dossiers (pas le zip lui-même) :
   `index.html`, `style.css`, `app.js`, `logic.js`, `native.js`, `package.json`,
   `capacitor.config.json`, `debug.keystore`, `build-apk.yml`,
   et les dossiers `sounds` (sons des rappels) et `resources` (icône de l'application).
   Sur ordinateur, glisse bien les dossiers entiers ; sur téléphone, ajoute leurs fichiers un par un
   si besoin (le dossier `resources/res/...` doit garder son arborescence).
   Les dossiers `tests`, `demo` et `assets` sont facultatifs.
4. En bas, clique sur **Commit changes**.

## 4. Activer la fabrication automatique de l'APK
GitHub n'accepte de lancer la fabrication que si le fichier `build-apk.yml` est dans un dossier
spécial. On le déplace :
1. Clique sur le fichier `build-apk.yml` dans la liste.
2. Clique sur l'icône crayon (**Edit this file**).
3. En haut, dans la case du nom de fichier, place le curseur tout au début, et tape :
   `.github/workflows/` (le nom doit devenir `.github/workflows/build-apk.yml`).
4. Clique sur **Commit changes**, puis encore **Commit changes**.

## 5. Attendre la compilation
1. Va dans l'onglet **Actions** du dépôt. Si GitHub demande d'activer les workflows,
   clique sur le bouton vert pour confirmer.
2. Tu verras « Construire l'APK » tourner (point jaune). Compte 5 à 10 minutes.
3. Un ✓ vert veut dire que c'est prêt.

## 6. Récupérer le lien APK
Sur la page principale du dépôt, à droite, clique sur **Releases**, puis sur la dernière version.
Dans **Assets**, le fichier `suivi-sante.apk` est ton lien de téléchargement.

Lien permanent qui pointe toujours vers la dernière version (remplace TON-PSEUDO) :

    https://github.com/TON-PSEUDO/suivi-sante/releases/latest/download/suivi-sante.apk

## 7. Installer sur le téléphone Android
1. Ouvre le lien sur le téléphone et télécharge le fichier.
2. Android demande d'autoriser l'installation depuis ce navigateur (« Installer des applications
   inconnues ») : autorise-le, puis rouvre le fichier téléchargé et appuie sur **Installer**.
3. Si Google Play Protect affiche un avertissement, c'est normal pour une application qui ne vient
   pas du Play Store : choisis **Installer quand même**.

## 8. Activer l'IA (gratuit)
Dans l'application, onglet **Réglages**, suis les instructions pour créer une clé gratuite
Google Gemini et la coller. Sans clé, la saisie rapide, l'historique et l'analyse fonctionnent déjà.

## Mettre à jour plus tard
Quand je te donne une nouvelle version : remplace les fichiers dans le dépôt (Upload files), attends le
nouveau ✓ vert, télécharge le nouvel APK et installe-le **par-dessus** l'ancien. Tes données sont
conservées. Ne désinstalle pas l'ancienne version avant.

## Important : sauvegarde
Tes données sont uniquement sur le téléphone. Si tu désinstalles l'application ou si tu perds le
téléphone, elles disparaissent. Dans **Réglages > Sauvegarde**, copie ta sauvegarde de temps en temps
et colle-la dans une note ou un mail à toi-même.

## Si la compilation échoue (croix rouge dans Actions)
Clique sur l'échec, ouvre l'étape en rouge, copie les dernières lignes d'erreur et envoie-les-moi :
je corrigerai.

## Pour info
- L'APK est signé avec une clé de test (fichier `debug.keystore`), parfait pour un usage personnel
  mais pas pour une publication sur le Play Store.
- Cette application est un carnet de suivi, pas un dispositif médical. Elle ne remplace pas l'avis d'un
  professionnel de santé.

## Notifications et icône
- Au premier lancement, Android demande l'autorisation d'envoyer des notifications : accepte.
- Sur Android 12 et plus, si les rappels arrivent en retard, va dans Paramètres > Applications > Suivi Santé >
  Alarmes et rappels, et autorise-les.
- L'application reprogramme les rappels des 7 prochains jours à chaque ouverture : ouvre-la de temps en temps.
- L'icône de l'écran d'accueil est ton logo (fichiers dans `resources`).
