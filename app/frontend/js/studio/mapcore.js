import {useEffect,useRef,useState} from './core.js';

const TILES={light:'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
             dark:'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'};
const tileUrl=()=>TILES[document.documentElement.dataset.theme==='dark'?'dark':'light'];


/* ── leaflet hook ── */
const MAP_BOUNDS={de:[[47.2,5.8],[55.1,15.2]],                 // frame Germany, not Europe
                  eu:[[35.9,-9.6],[60.9,24.2]]};               // DE+UK+PL+PT+ES coverage
function useMap(active,view){
  const ref=useRef(null),mapRef=useRef(null);
  const [,bump]=useState(0);   // re-render once the map exists, so draw effects (which
                               // captured mapRef.current=null during this render) re-run
  const bb=MAP_BOUNDS[view]||MAP_BOUNDS.de;
  useEffect(()=>{
    if(active&&ref.current&&!mapRef.current){
      const m=L.map(ref.current,{preferCanvas:true,zoomControl:false});
      m.fitBounds(bb,{padding:[8,8]});
      m._tl=L.tileLayer(tileUrl(),{subdomains:'abcd',maxZoom:19,crossOrigin:true,attribution:'© OSM © CARTO'}).addTo(m);
      window.addEventListener('gs-theme',()=>m._tl.setUrl(tileUrl()));
      L.control.zoom({position:'bottomleft'}).addTo(m);
      mapRef.current=m;
      bump(x=>x+1);
    }
    // returning to a tab (or switching view) refreshes: close any popup and re-frame
    if(active&&mapRef.current)setTimeout(()=>{
      const m=mapRef.current;m.invalidateSize();m.closePopup();
      m.fitBounds(bb,{padding:[8,8]});
    },60);
  },[active,view]);
  return [ref,mapRef];
}

export {MAP_BOUNDS,TILES,tileUrl,useMap};
