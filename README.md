# Laser Arena

Spielbares 3D-Lasertag mit Three.js und Vite, komplett als statisches Frontend. Keine Accounts, API-Keys, externen Assets, Backend-Verbindungen oder Online-Mitspieler. Oberfläche und Anleitung sind auf Deutsch.

## Windows: mit Dev Container starten

Voraussetzung: Docker Desktop mit laufender Linux-Engine, Visual Studio Code und die Erweiterung **Dev Containers** (`ms-vscode-remote.remote-containers`). Node.js muss unter Windows nicht installiert sein.

1. Docker Desktop starten und warten, bis die Engine bereit ist.
2. Diesen Projektordner in VS Code öffnen.
3. **Strg+Umschalt+P** → **Dev Containers: Reopen in Container** wählen (Deutsch: „Dev Containers: Erneut in Container öffnen“).
4. Beim ersten Start wird das offizielle Node.js-24-Image aus Docker Hub geladen. Der kleine Dockerfile ergänzt Entwicklungswerkzeuge, anschließend wird `npm ci` automatisch ausgeführt. Danach ein neues VS-Code-Terminal im Container öffnen und starten:

   ```sh
   npm run dev
   ```

5. Im Windows-Browser **http://localhost:5173** öffnen. Das Terminal bleibt geöffnet; **Strg+C** beendet Vite.

Die Konfiguration steht in `.devcontainer/devcontainer.json`. Linux-Abhängigkeiten liegen in einem eigenen Docker-Volume für dieses Arbeitsverzeichnis. Polling sorgt dafür, dass Änderungen an Dateien auf dem Windows-Laufwerk erkannt werden. Vite-Port 5173 wird an Windows veröffentlicht und in VS Code angezeigt; Port 4173 ist für `npm run preview` vorbereitet. Falls 5173 bereits verwendet wird, zuerst den anderen Entwicklungsserver beenden. Nach Konfigurationsänderungen **Dev Containers: Rebuild Container** ausführen.

**Smartphone:** Im selben WLAN `http://<Windows-IP>:5173` öffnen. Die Windows-IP zeigt `ipconfig` in einer Windows-PowerShell unter der aktiven WLAN-Verbindung. Die von Vite im Container angezeigte interne Docker-IP ist dafür nicht die richtige Adresse. Falls Windows nachfragt, den Zugriff für Docker Desktop im privaten Netzwerk zulassen.

Tests und Produktionsbuild laufen ebenfalls im Container:

```sh
npm test
npm run build
npm run preview
```

Das Spiel wird weiterhin im Browser des Endgeräts gerendert. GPU-Durchreichung oder Browserinstallation im Container sind nicht erforderlich.

## Lokal ohne Container starten

Voraussetzung: Node.js **20.19+ oder 22.12+** (empfohlen: aktuelle LTS-Version), npm und ein aktueller Browser mit WebGL 2 / Hardwarebeschleunigung.

```sh
npm install
npm run dev
```

Die angezeigte lokale URL öffnen. Für Smartphone-Tests im selben WLAN die von Vite angezeigte Netzwerkadresse des Rechners verwenden. Das Gerät muss den Entwicklungsserver erreichen können.

```sh
npm test          # Kollisionen, Treffer, Wegfindung, Siege und vollständige KI-Runden
npm run build    # Statischer Build in dist/
npm run preview  # Produktionsbuild lokal prüfen
```

## Spielen

- **Smartphone, Querformat:** links mit dem Joystick laufen; rechts wischen zum freien Umsehen. FIRE gedrückt halten zum Schießen. Leichte Zielhilfe nur bei Touch. Die Steuerung unterstützt gleichzeitiges Laufen, Zielen und Schießen.
- **PC:** WASD oder Pfeiltasten, Maus zum Zielen, linke Maustaste oder Leertaste zum Schießen. Start/Klick aktiviert die Maussperre, falls unterstützt; alternativ mit gedrückter Maustaste ziehen. Esc oder P pausiert.
- **Team gegen Team:** 4 Pink gegen 4 Blau. Team wählbar, kein Teambeschuss. Das letzte Team mit lebenden Menschen gewinnt.
- **Jeder gegen jeden:** sieben menschliche Figuren; die letzte überlebende gewinnt.
- Menschen haben genau drei Trefferpunkte, keine Heilung und 0,38 Sekunden Trefferschutz. Orange Wächter haben zwei Trefferpunkte, greifen alle Menschen an und zählen nicht für den Sieg. Ab Sekunde 12 erscheint höchstens alle 15 Sekunden ein Wächter, maximal drei gleichzeitig.
- Nach dem eigenen Ausscheiden läuft die Runde weiter; über „Nächste Figur“ kann man zuschauen. Teamkollegen können noch gewinnen. Tabwechsel pausiert die Runde.

## Statisch veröffentlichen

`npm run build` ausführen und **den Inhalt von `dist/`** auf einen statischen Webserver hochladen. Keine Serverfunktionen oder Umgebungsvariablen nötig. `vite.config.js` nutzt `base: './'`: auch Unterpfade wie `https://name.github.io/laser-arena/` funktionieren ohne Anpassung. Es gibt keine Client-Routen, die Weiterleitungsregeln benötigen. Den Build über HTTP(S) öffnen, nicht per `file://`.

**GitHub Pages:** Repository hochladen, unter *Settings → Pages → Source* „GitHub Actions“ wählen und den beigefügten Workflow manuell über *Actions → Deploy to GitHub Pages → Run workflow* starten. Er installiert mit `npm ci`, prüft die Mechaniken, baut das Projekt und veröffentlicht `dist/`. Die Pages-URL erscheint im abgeschlossenen Deployment. Alternativ kann `dist/` bei jedem anderen statischen Hosting-Anbieter veröffentlicht werden.

## Struktur und Technik

```text
src/world.js     Arena, gemeinsame Kollisionsgeometrie, Sichtlinien, Raster-Wegfindung
src/game.js      Lokale Simulation, KI, Treffer, Spawns, Gewinnbedingungen
src/renderer.js  Three.js, prozedurale Arena/Rüstungen, Laser, Ego- und Zuschauerkamera
src/controls.js  Multitouch-Joystick, Wischen, Tastatur und Maus
src/audio.js     Kleine lokal synthetisierte Soundeffekte
src/main.js      Spielablauf, Menüs und HUD
tests/           Automatisierte Mechanik- und vollständige KI-Rundentests
```

Die KI sucht Gegner mit Sichtprüfung, läuft mit Raster-Wegfindung um Hindernisse, wechselt Schusspositionen und sucht Deckung. Hitscan prüft zuerst Wände und die nächstgelegene Figur; sichtbare Laser zeigen jeden Schuss. Kein Schießen durch Blöcke.

Für mobile Geräte: begrenzte Pixelratio (Touch max. 1,35, automatisch auf 1 bei anhaltend langsamen Frames), Instancing für Blöcke und Neonstreifen, gemeinsame Geometrien/Materialien, 48 wiederverwendete Schusseffekte, maximal drei Monster, keine Echtzeitschatten oder Postprocessing. Die Bildrate hängt vom Gerät ab; ein Test auf echten Smartphones bleibt erforderlich. Kein Speichern von Spielfortschritt.
