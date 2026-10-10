# Cloud (Firebase) – Setup & Sicherheit

Die App unterstützt **Login + geräteübergreifenden Sync** über Firebase.
Damit das **wirklich sicher** ist, musst du in der Firebase‑Konsole einmalig ein paar Dinge aktivieren.

## 1) Firebase Console – Pflichtschritte

### 1.1 Authentication aktivieren
Firebase Console → **Authentication** → **Sign-in method**
- **Email/Password** aktivieren

### 1.2 Firestore aktivieren
Firebase Console → **Firestore Database**
- Datenbank erstellen (Production Mode empfohlen)

## 2) Sicherheitsregeln (Rules)

Die App schreibt in:
- `orgs/{orgId}/meta/workspace_state` (zentraler Workspace‑State)
- `orgs/{orgId}/users/{uid}` (Benutzerprofil + Rolle)
- `orgs/{orgId}/tasks/{taskId}` (Kundenaufgaben)

➡️ Nutze die Datei **`firestore.rules`** im Projektordner als Start.

## 3) Admin‑Whitelist

In `firebase-config.js` ist eine Admin‑Whitelist hinterlegt:

- `window.firebaseAdminEmails = [...]`

Nur diese E‑Mails bekommen automatisch die Rolle **admin**.

## 4) Wichtiger Hinweis zur DSGVO

Wenn du Cloud nutzt:
- In deiner Datenschutzerklärung angeben, dass Daten über Firebase verarbeitet werden.
- Auftragsverarbeitung/Datenschutzinfos von Google/Firebase prüfen.

