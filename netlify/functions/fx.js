// Live KRW per USD for FOB pricing: Hana Bank's "송금 받으실 때" (wire, USD sell side) rate, read from Hana's public rate page.
// Falls back to the market mid-rate minus 0.97% if Hana is unreachable. Cached 10 minutes at the edge.
exports.handler = async () => {
  const hdr = {'Content-Type':'application/json','Cache-Control':'public, max-age=300, s-maxage=600','Access-Control-Allow-Origin':'*'};
  const kst = new Date(Date.now()+9*3600*1000).toISOString().slice(0,10).replace(/-/g,'');
  try {
    const body = new URLSearchParams({ajax:'true',curCd:'USD',inqStrDt:kst,pbldDvCd:'1',inqKindCd:'1',requestTarget:'searchContentDiv'});
    const r = await fetch('https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},body});
    const txt = (await r.text()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const m = txt.match(/USD\s+([\d,.]+)\s+[\d.]+\s+([\d,.]+)\s+[\d.]+\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/);
    if (m) {
      const n = s => parseFloat(s.replace(/,/g,''));
      const sell = n(m[4]), base = n(m[6]);
      if (sell > 900 && sell < 2500) return {statusCode:200,headers:hdr,body:JSON.stringify({rate:sell,base,cash_sell:n(m[2]),wire_buy:n(m[3]),source:'hana',date:kst})};
    }
  } catch (e) {}
  try {
    const d = await (await fetch('https://open.er-api.com/v6/latest/USD')).json();
    const mid = d.rates.KRW;
    return {statusCode:200,headers:hdr,body:JSON.stringify({rate:Math.round(mid*0.9903*100)/100,base:mid,source:'market-fallback',date:kst})};
  } catch (e) { return {statusCode:502,headers:hdr,body:JSON.stringify({error:'rate unavailable'})}; }
};
