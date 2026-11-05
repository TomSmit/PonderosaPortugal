# Ponderosa Portugal

De website van het zomertraject op Quinta Dionisio, bij Trinta in de vallei van de Mondego.
Hoofdadres: ponderosaportugal.nl. De site is er in het Nederlands, Portugees en Engels.

## Teksten aanpassen

Alle teksten staan in de map `inhoud/`, per taal een eigen map (`nl`, `pt`, `en`).

* `paginas/` bevat de pagina's, zoals `1-zes-weken.md`. Bovenin staan tussen twee regels `---` de titel, de intro en eventueel de feitjes of vragen. Daaronder staat de gewone tekst. Een regel die met `## ` begint, wordt een tussenkopje. Een witregel begint een nieuwe alinea.
* `plekken.yml` bevat het verhaal van elke plek op de kaart. Elke regel onder `tekst:` is een alinea.
* `kaart.yml` bevat de titel, de zin eronder en de knop op de kaart.
* `algemeen.yml` bevat losse teksten, zoals de contactgegevens en het aanmeldformulier.

Het getal voor de bestandsnaam van een pagina bepaalt alleen de volgorde in de map. De volgorde op de site komt uit `volgorde:` bovenin het bestand. Het webadres van een pagina staat bij `adres:`. Verander dat liever niet meer als de site eenmaal online staat.

## Foto's

Foto's per plek staan in `fotos/<plek>/` en worden genoemd in `inhoud/plekken.yml`. Zie `fotos/LEESMIJ.md`.

## Hoe het online komt

Na elke wijziging op `main` bouwt GitHub de site opnieuw (zie het tabblad Actions) en zet hem online. Dat duurt een minuut of twee.

Zolang in `instellingen.yml` staat `live: false`, vragen we zoekmachines de site nog niet op te nemen.

Technisch: `bouw.py` maakt van de inhoud gewone HTML in `_site/`. De 3D-kaart staat in `static/kaart.js`, de opmaak in `static/stijl.css`. Hoogtedata: AWS Terrain Tiles. Kaartgegevens: © OpenStreetMap-bijdragers (ODbL). three.js valt onder de MIT-licentie.
