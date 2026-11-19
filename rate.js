/* JS INTERNATIONAL - live KRW/USD for FOB prices. Rate = Hana Bank USD wire (selling-dollars side) rate via /.netlify/functions/fx. */
(function(){
var FALLBACK_RATE=1325.70, K='jsi_fx';
function fmt(n){return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');}
var JSI=window.JSI={insp:150000,fmt:fmt};
function cached(){try{var o=JSON.parse(localStorage.getItem(K));if(o&&o.mid>900&&o.mid<2500)return o}catch(e){}return null}
var c=cached();
JSI.mid=c?c.mid:FALLBACK_RATE; JSI.stamp=c?c.t:'2026-11-18';
JSI.rate=function(){return JSI.mid};
JSI.usd=function(krw){return Math.round(krw/JSI.rate()/100)*100};
JSI.apply=function(){
 var els=document.querySelectorAll('[data-krw]');
 for(var i=0;i<els.length;i++){var e=els[i],u=JSI.usd(+e.getAttribute('data-krw')+(+e.getAttribute('data-extra')||0));
  if(e.tagName==='TR'){e.setAttribute('data-price',u);var p=e.querySelector('.pr');if(p)p.textContent='US$'+fmt(u);}
  else e.textContent='US$'+fmt(u);}
 var s=document.getElementById('jsi-rate-note');if(s)s.textContent='Rate: US$1 = ₩'+fmt(JSI.rate())+' (Hana Bank USD rate, '+JSI.stamp+')';
 if(window.JSI_after)window.JSI_after();
};
JSI.refresh=function(){
 try{fetch('/.netlify/functions/fx').then(function(r){return r.json()}).then(function(d){
  var k=d&&d.rate;if(k>900&&k<2500){JSI.mid=k;JSI.stamp=d.date||'';
   try{localStorage.setItem(K,JSON.stringify({mid:k,t:JSI.stamp}))}catch(e){}
   if(document.readyState!=='loading')JSI.apply();}}).catch(function(){});}catch(e){}
};
document.addEventListener('DOMContentLoaded',function(){JSI.apply();JSI.refresh();});
})();
