/**
 * Server-side gateway for the official UK Police API.
 * No API keys, tracking, fabricated records, or persistent incident storage.
 * All street-level police positions are anonymised by the source.
 */
const POLICE_BASE = 'https://data.police.uk/api';

async function policeFetch(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 17000);
  try {
    const response = await fetch(POLICE_BASE + path, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'CrimeScopeUK-Portfolio/1.0' },
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error('Official Police API returned HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=18000, stale-while-revalidate=36000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({error:'Only GET requests are supported.'});
  const mode = typeof req.query.mode === 'string' ? req.query.mode : 'crimes';
  if (!['dates','crimes','count'].includes(mode)) return res.status(400).json({error:'Unsupported request mode.'});
  try {
    if (mode === 'dates') {
      const rows = await policeFetch('/crimes-street-dates');
      const dates = Array.from(new Set(rows.map(r=>r.date).filter(d=>/^\d{4}-\d{2}$/.test(d)))).sort().reverse();
      return res.status(200).json({source:'UK Police Open Data',dates:dates});
    }
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!Number.isFinite(lat)||!Number.isFinite(lng)||lat<49||lat>61||lng< -9||lng>3) {
      return res.status(400).json({error:'Enter valid UK geographic coordinates.'});
    }
    if (date && !/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) {
      return res.status(400).json({error:'Invalid date. Use YYYY-MM.'});
    }
    const endpoint = '/crimes-street/all-crime?lat='+encodeURIComponent(lat.toFixed(5))+
      '&lng='+encodeURIComponent(lng.toFixed(5))+(date?'&date='+encodeURIComponent(date):'');
    const raw=await policeFetch(endpoint);
    if (!Array.isArray(raw)) throw new Error('Unexpected response from police data provider.');
    if (mode==='count') return res.status(200).json({count:raw.length,month:date||raw[0]?.month||null});
    const crimes=raw.map((x,i)=>{
      const coords=x.location||{};
      return {
        id:x.persistent_id||String(x.id||i),
        category:x.category||'other-crime',
        month:x.month||date||'',
        lat:coords.latitude==null?null:Number(coords.latitude),
        lng:coords.longitude==null?null:Number(coords.longitude),
        street:coords.street?.name||'Approximate location',
        outcome:x.outcome_status?.category||'Outcome not available'
      };
    }).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng));
    return res.status(200).json({
      source:'UK Police Open Data',method:'crimes-street/all-crime',
      month:date||raw[0]?.month||null,
      searchRadius:'Approximately one mile',
      originalCount:raw.length,
      crimes:crimes,
      notice:'Coordinates are anonymised. Published monthly, not in real time.'
    });
  } catch (err) {
    const timeout=err&&err.name==='AbortError';
    const status=timeout?504:err.status===404?404:502;
    console.error('CrimeScope official data request failed:',String(err.message||err));
    return res.status(status).json({error:timeout?'Police data service timed out. Please retry.':err.status===404?'The requested month is not published yet.':'The official Police API is currently unavailable. Please retry later.'});
  }
};