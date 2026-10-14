# Bencho

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Bencho](https://bencho.dev/), [Sounds](https://bencho.dev/sounds).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für einzelne hochwertige Mikrointeraktionen und mobile Bedienmuster.
- **Typ / Technologie:** Interaktive React-Blocks und separate UI-Soundgalerie.
- **Angebot:** Mehr als 40 Blocks mit Hover, Press, Drag, Slide, Swipe, Type und Select. Unter anderem OTP-Eingabe, Pull-to-refresh, Slide-to-confirm, Bildvergleich, umsortierbare Elemente, Signatur und Dynamic Island. Detailansichten erlauben visuelle Einstellungen. Soundgalerie nennt 82 Effekte für Actions, Feedback, Navigation, Notifications, Selection, Movement, Progress und System.
- **Zugang:** Vorschauen und geprüfter Code-Tab ohne Login. Sounddialog bietet Abspielen und WAV-Download; Save-/Account-Funktionen sind gesondert.
- **Kommerziell / Nennung:** Blocks und über Code-Panes kopierter Code sind ausdrücklich MIT-lizenziert; kommerziell erlaubt, Copyright/Lizenz erhalten, kein sichtbarer Credit/Linkback verlangt. Website-/Account-Anwendung, Marke, Fotos und die lizenzierte Maison-Neue-Schrift sind davon ausgenommen. **Keine ebenso klare Freigabe der WAV-Sounds gefunden.** [Licence](https://bencho.dev/licence)
- **MCP:** Kein eigener offizieller kostenloser MCP gefunden. Ein auf der Website beworbener Mobbin-MCP gehört zum Sponsor und ist kein Bencho-Codezugang.
- **Flutter-Einsatz – eigene Einschätzung:** Sehr brauchbar für Gesten und Zustandsübergänge. Animation, Eingabe-/Fokusverhalten und Haptik passend zur App umsetzen. Ton sparsam einsetzen, sobald die konkrete Sound-Lizenz geklärt ist.
- **Tags:** `web-components`, `motion`, `inputs`, `loading`, `touch`, `sounds`.

**Schnellster Zugriff:** Block per direktem Link öffnen → `Code` → Install/Usage/Code-Abschnitte. Das OTP-Beispiel zeigt eine React-/TSX-Datei und `lucide-react` als Installhinweis. Nicht jeden Block als identischen Stack behandeln.

| Referenz | Direktlink | Nutzen für Flutter |
| --- | --- | --- |
| One-time Code | [OTP](https://bencho.dev/blocks/one-time-code) | Code-Eingabe, Fokuswechsel und Bestätigungszustand |
| Pull | [Pull-to-refresh](https://bencho.dev/blocks/pull) | Zugbewegung und Rückmeldung |
| Slide Confirm | [Bestätigung](https://bencho.dev/blocks/slide-confirm) | Bewusste Bestätigung per Schiebegeste |
| Image Compare | [Bildvergleich](https://bencho.dev/blocks/image-compare) | Interaktiver Vorher-/Nachher-Slider |
| Liquid Arrange | [Umsortieren](https://bencho.dev/blocks/liq-arrange) | Bewegungsverhalten beim Neuordnen |
| UI-Sounds | [Soundgalerie](https://bencho.dev/sounds) | Kategorie/Suche → Sound öffnen → WAV; Rechte zuerst klären |

**Grenzen:** Animierte Blocks sind keine komplette App oder Backend-Funktion. Bilder und Schrift austauschen oder gesondert lizenzieren. Klangqualität und kommerzielle Sound-Nutzung wurden nicht bestätigt.

**Prüfung, 2026-10-05:** Blockübersicht, Kategorien und OTP-Detail samt Code-Tab/Installhinweisen im Browser gelesen; Lizenztext ausgewertet. Sounds und Whisk-Dialog mit WAV-Aktion geöffnet, keine WAV-Datei heruntergeladen oder Integration getestet.
