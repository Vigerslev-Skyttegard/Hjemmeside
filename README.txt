# Hjemmeside – Ejerforeningen Skyttegård/Vigerslev.

Dette repository indeholder den offentlige hjemmeside for ejerforeningen i
Valby. Siden er bygget som statisk HTML, CSS og JavaScript uden framework,
CMS eller buildproces.

## Sider

- `index.html` – Forside
- `velkomstbrev.html` – Information til nye ejere
- `husorden&vedtægter.html` – Husorden og vedtægter
- `nyhed.html` – Nyheder og referater
- `parkering.html` – Parkeringsoplysninger
- `eksempler.html` – Eksempelside til design- og komponentreferencer
- `sidebar.html` – Fælles navigation og kontaktoplysninger

## Filer og redigering

- `assets/css/main.css` er sidens aktive stylesheet.
- `assets/sass/` indeholder Sass-kildefilerne.
- `assets/js/` indeholder sidens scripts og de nødvendige biblioteker.
- `images/` indeholder billeder.

Redigér indholdet i den relevante HTML-fil. Navigation og kontaktoplysninger
vedligeholdes ét sted i `sidebar.html`.

## Kør lokalt

Start en statisk webserver fra projektmappen:

```sh
python3 -m http.server 5000 --bind 0.0.0.0
```

Åbn derefter `http://localhost:5000/`. På Replit bruges workflowet **Start
application** og projektets Preview.

## Hosting

Den midlertidige GitHub Pages-adresse er:
https://vigerslev-skyttegard.github.io/Hjemmeside/

De ønskede domæne er www.skyttegaardvej.dk og vigerslevvej.dk

Skyttegaardvej.dk > Aktivt

vigerslevvej.dk > ikke købt
