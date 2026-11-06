/* Correcties op de kaartgegevens uit OpenStreetMap.
   Alles in graden (breedte, lengte), overgetekend van de satellietfoto.
   Dit bestand wordt geladen na vallei-data.js en voor kaart.js. */
(function(){
  const V = window.VALLEI; if(!V) return;
  const [Z, CX0, CX1, CY0, CY1] = V.merc, N = Math.pow(2, Z);
  function f(lat, lon){
    const x = (lon + 180) / 360 * N, s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N;
    return [(x - CX0) / (CX1 - CX0), (y - CY0) / (CY1 - CY0)];
  }
  const ring = pts => pts.flatMap(([la, lo]) => f(la, lo));
  function inRing(x, y, r){ let c=false; const n=r.length/2; for(let i=0,j=n-1;i<n;j=i++){ const xi=r[i*2],yi=r[i*2+1],xj=r[j*2],yj=r[j*2+1]; if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; }

  /* Grote loodsen en hallen: grijs dak */
  const INDUSTRIE = [
    { naam:"Loodsen aan de M619 (west)", punten:[[40.499527,-7.355835], [40.499527,-7.355319], [40.498603,-7.355319], [40.498603,-7.355835]] },
    { naam:"Loodsen aan de M619 (oost)", punten:[[40.499496,-7.355286], [40.499496,-7.354443], [40.498418,-7.354443], [40.498418,-7.35491], [40.497894,-7.35491], [40.497894,-7.355286]] },
    { naam:"Grijze hal bij Proteína Viva", punten:[[40.497278,-7.352519], [40.49734,-7.352314], [40.497062,-7.352093], [40.496989,-7.352289]] },
    { naam:"Loods langs de N338", punten:[[40.497463,-7.354058], [40.497481,-7.35387], [40.496878,-7.353829], [40.496865,-7.354017]] }
  ];
  /* Gewone gebouwen die in OpenStreetMap ontbreken */
  const GEBOUWEN = [
    { naam:"Proteína Viva, lange hal", punten:[[40.497679,-7.353436], [40.497796,-7.353239], [40.497371,-7.352519], [40.497235,-7.352715]] },
    { naam:"Proteína Viva, bij de weg", punten:[[40.497863,-7.35373], [40.497956,-7.353583], [40.497802,-7.353378], [40.497709,-7.353526]] },
    { naam:"Proteína Viva, klein gebouw", punten:[[40.497481,-7.352437], [40.497543,-7.352338], [40.497445,-7.352191], [40.497383,-7.352289]] },
    { naam:"Cadeira de Encosto", punten:[[40.49652,-7.351249], [40.49657,-7.351004], [40.496416,-7.350946], [40.496366,-7.351192]] },
    { naam:"Huis aan de Av. Mártir São Sebastião", punten:[[40.496724,-7.355499], [40.496724,-7.355352], [40.496582,-7.355352], [40.496582,-7.355499]] },
    { naam:"Huis aan de Av. Mártir São Sebastião 2", punten:[[40.496742,-7.355254], [40.496742,-7.355106], [40.496644,-7.355106], [40.496644,-7.355254]] },
    { naam:"Huis langs de N338", punten:[[40.496989,-7.353051], [40.497001,-7.352887], [40.496865,-7.352871], [40.496853,-7.353034]] },
    { naam:"Huis langs de N338 2", punten:[[40.496865,-7.352748], [40.496878,-7.352584], [40.496742,-7.352568], [40.49673,-7.352731]] },
    { naam:"Huis aan de westkant", punten:[[40.499022,-7.356679], [40.499022,-7.356548], [40.498923,-7.356548], [40.498923,-7.356679]] }
  ];
  /* Stukken die geen bos zijn, maar wel binnen een bosvlak vallen */
  const OPEN_IN_BOS = [
    { naam:"Open plek rond Cadeira de Encosto", punten:[[40.496631,-7.351781], [40.496705,-7.351372], [40.49668,-7.350799], [40.496508,-7.350553], [40.496311,-7.350635], [40.496249,-7.351004], [40.496231,-7.351454], [40.496354,-7.351741]] }
  ];
  /* Erven en dorpsranden die bij het dorp horen */
  const DORP = [
    { naam:"Erf van Cadeira de Encosto", punten:[[40.4966,-7.351454], [40.496631,-7.35084], [40.496446,-7.350717], [40.496292,-7.350963], [40.496292,-7.351372], [40.496446,-7.351495]] }
  ];

  V.layers.industrie = (V.layers.industrie || []).concat(INDUSTRIE.map(g => ring(g.punten)));
  V.layers.building = (V.layers.building || []).concat(GEBOUWEN.map(g => ring(g.punten)));
  OPEN_IN_BOS.forEach(g => {
    const r = ring(g.punten); let cx=0, cy=0; for(let i=0;i<r.length;i+=2){ cx+=r[i]; cy+=r[i+1]; } cx/=r.length/2; cy/=r.length/2;
    (V.layers.wood || []).forEach(poly => { if(inRing(cx, cy, poly[0])) poly.push(r); });
  });
  V.layers.village = (V.layers.village || []).concat(DORP.map(g => [ring(g.punten)]));
})();
