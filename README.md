# Ponderosa Portugal

De website van het zomertraject op Quinta Dionisio, bij Trinta in de vallei van de Mondego.
Hoofdadres: ponderosaportugal.nl. De site is er in het Nederlands, Portugees en Engels.

## Teksten en foto's aanpassen

De makkelijkste manier is het beheerscherm op app.pagescms.org. Daar zie je invulvelden in plaats van bestanden. Wie geen GitHub-account heeft, kan per e-mail worden uitgenodigd.

Wie liever in de bestanden zelf werkt:

* `inhoud/plekken/` bevat per plek op de kaart één bestand, met de ligging, het verhaal in drie talen en de foto's met hun bijschriften. In het verhaal begint een witregel een nieuwe alinea.
* `inhoud/nl/paginas/` (en `pt`, `en`) bevat de pagina's. Bovenin staan tussen twee regels `---` de titel, de intro en eventueel de feitjes of vragen. Daaronder staat de gewone tekst. Een regel die met `## ` begint, wordt een tussenkopje.
* `inhoud/nl/kaart.yml` bevat de titel, de zin eronder en de knop op de kaart.
* `inhoud/nl/algemeen.yml` bevat losse teksten, zoals de contactgegevens en het aanmeldformulier.

Foto's staan in `fotos/`. De site maakt ze bij het bouwen zelf kleiner en haalt de verborgen gegevens eruit, zoals de GPS-locatie. Het origineel staat wel in deze openbare repository, dus zet hier alleen foto's waarvoor toestemming is.

## Hoe het online komt

Na elke wijziging op `main` bouwt GitHub de site opnieuw (zie het tabblad Actions) en zet hem online. Dat duurt een minuut of twee.

Zolang in `instellingen.yml` staat `live: false`, vragen we zoekmachines de site nog niet op te nemen.

Technisch: `bouw.py` maakt van de inhoud gewone HTML in `_site/`. De 3D-kaart staat in `static/kaart.js`, de opmaak in `static/stijl.css`. Hoogtedata: AWS Terrain Tiles. Kaartgegevens: © OpenStreetMap-bijdragers (ODbL). three.js valt onder de MIT-licentie.
