/* CrimeScope UK — independent portfolio project. Official data only; no fabricated incident records. */
(function () {
  'use strict';
  const $ = function(id){return document.getElementById(id);};
  const places = {
    Crawley:{name:'Crawley, West Sussex',lat:51.1091,lng:-0.1872},
    London:{name:'Central London',lat:51.5074,lng:-0.1278},
    Brighton:{name:'Brighton, East Sussex',lat:50.8225,lng:-0.1372},
    Birmingham:{name:'Birmingham, West Midlands',lat:52.4862,lng:-1.8904},
    Manchester:{name:'Manchester, Greater Manchester',lat:53.4808,lng:-2.2426},
    Leeds:{name:'Leeds, West Yorkshire',lat:53.8008,lng:-1.5491},
    Cardiff:{name:'Cardiff, Wales',lat:51.4816,lng:-3.1791}
  };
  const state = {area:Object.assign({},places.Crawley),month:'',dates:[],crimes:[],previous:null,category:'all',street:'',page:0,loading:false,model:null,selected:null,mode:'heat',map:null,exploreMap:null,layers:{},monitor:null,geoMarker:null,lastAlertLevel:0,lastAlertAt:0,lastGeoReloadAt:0,requestId:0};
  const readable = { 'anti-social-behaviour':'Anti-social behaviour','bicycle-theft':'Bicycle theft','burglary':'Burglary','criminal-damage-arson':'Criminal damage & arson','drugs':'Drugs','other-crime':'Other crime','other-theft':'Other theft','possession-of-weapons':'Possession of weapons','public-order':'Public order','robbery':'Robbery','shoplifting':'Shoplifting','theft-from-the-person':'Theft from the person','vehicle-crime':'Vehicle crime','violent-crime':'Violence & sexual offences' };
  const format = new Intl.NumberFormat('en-GB');
  function title(category){return readable[category] || String(category||'Unspecified').replace(/-/g,' ').replace(/^./,function(c){return c.toUpperCase();});}
  function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function toast(message,error){const el=$('toast');el.textContent=message;el.className='toast show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(function(){el.className='toast';},4700);}
  function setText(id,value){const el=$(id);if(el)el.textContent=String(value);}
  function countByCategory(crimes){const out={};crimes.forEach(function(x){out[x.category]=(out[x.category]||0)+1;});return Object.entries(out).sort(function(a,b){return b[1]-a[1];});}
  function distanceKm(a,b,c,d){const rad=Math.PI/180,dy=(c-a)*rad,dx=(d-b)*rad;const v=Math.sin(dy/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dx/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(v)));}
  function csvDownload(filename,rows){const str=rows.map(function(r){return r.map(function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');const blob=new Blob(['\ufeff'+str],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  function loading(active){state.loading=active;setText('connectionText',active?'Loading police records…':state.crimes.length?'Data connected':'No records loaded');$('searchButton').disabled=active;$('searchButton').firstChild.textContent=active?'Loading… ':'Explore area ';}

  function navigate(page) {
    document.querySelectorAll('.page').forEach(function(n){n.classList.toggle('page-active',n.id==='page-'+page);});
    document.querySelectorAll('[data-page]').forEach(function(n){n.classList.toggle('active',n.dataset.page===page);});
    setText('currentPage',page.toUpperCase());
    window.scrollTo({top:0,behavior:'instant'});
    setTimeout(function(){if(state.map)state.map.invalidateSize();if(state.exploreMap)state.exploreMap.invalidateSize();},70);
  }
  function initMaps(){
    state.map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([state.area.lat,state.area.lng],13);
    state.exploreMap=L.map('exploreMap',{zoomControl:true,preferCanvas:true}).setView([state.area.lat,state.area.lng],13);
    [state.map,state.exploreMap].forEach(function(map,index){
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',maxZoom:19}).addTo(map);
      if(index===0)L.control.zoom({position:'bottomright'}).addTo(map);
      map.on('click',function(e){
        const p={lat:e.latlng.lat,lng:e.latlng.lng};
        if(distanceKm(p.lat,p.lng,state.area.lat,state.area.lng)>1.5){toast('Loading police data for the point you selected.');state.area={name:'Selected map point',lat:p.lat,lng:p.lng};state.month='';loadArea();return;}
        state.selected=p;drawSelected();renderModel();
      });
    });
  }
  function renderMap(){
    const pts=filteredCrimes();
    [state.map,state.exploreMap].forEach(function(map,idx){
      if(!map)return;
      const key=idx?'explore':'overview';
      if(state.layers[key])map.removeLayer(state.layers[key]);
      if(state.mode==='heat'&&typeof L.heatLayer==='function'){
        state.layers[key]=L.heatLayer(pts.filter(function(x){return Number.isFinite(x.lat)&&Number.isFinite(x.lng);}).map(function(x){return [x.lat,x.lng,.58];}),{radius:26,blur:21,maxZoom:16,minOpacity:.26,gradient:{.2:'#369cbd',.45:'#89d87d',.7:'#e2e983',1:'#ee826a'}}).addTo(map);
      } else {
        const group=L.layerGroup(); const max=1200; const step=Math.max(1,Math.ceil(pts.length/max));
        pts.forEach(function(x,i){if(i%step||!Number.isFinite(x.lat)||!Number.isFinite(x.lng))return;L.circleMarker([x.lat,x.lng],{radius:5,color:'#c6f378',weight:1,fillColor:'#b8e87b',fillOpacity:.55}).bindPopup('<strong>'+escapeHtml(title(x.category))+'</strong><br>'+escapeHtml(x.street)+'<br>'+escapeHtml(x.month)+'<br><small>Approximate police location</small>').addTo(group);});
        state.layers[key]=group.addTo(map);
      }
    });
    drawSelected();
    setText('mapDate','MONTH '+(state.month||'LATEST'));
  }
  function drawSelected(){
    if(!state.selected)return;
    [state.map,state.exploreMap].forEach(function(map,i){
      if(!map)return;
      const key=i?'pickExplore':'pickOverview';
      if(state.layers[key])map.removeLayer(state.layers[key]);
      state.layers[key]=L.circleMarker([state.selected.lat,state.selected.lng],{radius:10,color:'#e0fda2',weight:3,fillColor:'#9bd771',fillOpacity:.25}).addTo(map).bindTooltip('Analysis point',{direction:'top',offset:[0,-8]});
    });
  }
  function changeMode(mode){state.mode=mode;[['heatMode','exploreHeat'],['pointMode','explorePoints']].forEach(function(pair,i){pair.forEach(function(id){$(id).classList.toggle('selected',mode===(i?'points':'heat'));});});renderMap();}
  function centerMaps(){[state.map,state.exploreMap].forEach(function(m){m.setView([state.area.lat,state.area.lng],13);});}

  // Genuine non-parametric spatial density estimation (Gaussian KDE), not a crime prediction engine.
  // Convert lat/lng to approximate kilometres in a local tangent plane at the selected area centre.
  function trainModel() {
    const base=state.area,scaleX=111.32*Math.cos(base.lat*Math.PI/180),h=.45;
    const points=state.crimes.filter(function(x){return Number.isFinite(x.lat)&&Number.isFinite(x.lng);}).map(function(x){return {x:(x.lng-base.lng)*scaleX,y:(x.lat-base.lat)*111.32};});
    if(points.length<10){state.model=null;return;}
    const density=function(lat,lng){
      const x=(lng-base.lng)*scaleX,y=(lat-base.lat)*111.32,cut=3*h,den=2*h*h;let s=0;
      for(let i=0;i<points.length;i++){const dx=points[i].x-x,dy=points[i].y-y;if(Math.abs(dx)>cut||Math.abs(dy)>cut)continue;s+=Math.exp(-(dx*dx+dy*dy)/den);}
      return s/(points.length*2*Math.PI*h*h);
    };
    const grid=[];
    for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++){const x=i*.145,y=j*.145;if(Math.hypot(x,y)>1.15)continue;grid.push(density(base.lat+y/111.32,base.lng+x/scaleX));}
    state.model={density:density,grid:grid,samples:points.length,bandwidth:h};
  }
  function riskAt(lat,lng){
    if(!state.model||!state.model.grid.length)return null;
    if(distanceKm(lat,lng,state.area.lat,state.area.lng)>1.5)return null;
    const v=state.model.density(lat,lng),grid=state.model.grid;
    const smaller=grid.filter(function(x){return x<=v;}).length;
    const percentile=Math.min(100,Math.round(100*smaller/grid.length));
    return {percentile:percentile,label:percentile>=67?'Elevated relative density':percentile>=34?'Moderate relative density':'Lower relative density',level:percentile>=67?3:percentile>=34?2:1,raw:v};
  }
  function renderModel(){
    const risk=state.selected?riskAt(state.selected.lat,state.selected.lng):null;
    const ring=$('riskRing');
    if(!risk){setText('riskPercentile','—');setText('riskLabel','Insufficient local data');setText('riskDescription','The model requires at least 10 geolocated records in the selected dataset.');ring.style.background='conic-gradient(#26363b 0 360deg)';}
    else {
      setText('riskPercentile',risk.percentile+'th');
      setText('riskLabel',risk.label);
      setText('riskDescription','This point is at approximately the '+risk.percentile+'th percentile of modelled incident density within the sampled search area.');
      const hue=risk.level===3?'#ed9a6e':risk.level===2?'#d8df8e':'#9de4ba';
      ring.style.background='conic-gradient('+hue+' 0 '+(risk.percentile*3.6)+'deg,#283640 '+(risk.percentile*3.6)+'deg 360deg)';
    }
    setText('modelSamples',state.model?format.format(state.model.samples)+' records':'— records');
    const confidence=!state.model?'Insufficient data':state.model.samples>=200?'Larger sample':state.model.samples>=50?'Medium sample':'Sparse sample';
    setText('modelConfidence',confidence);
    setText('intelSample',state.model?format.format(state.model.samples):'—');
    setText('intelHealth',state.model?'Model fitted on '+format.format(state.model.samples)+' incident coordinates from '+(state.month||'the latest month')+'. It estimates relative density across nearby grid points using a fixed 450m bandwidth. Sample size does not validate predictive accuracy.':'Not enough geolocated records to fit the model.');
  }

  async function getJson(url){
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    let body=null;try{body=await r.json();}catch(e){}
    if(!r.ok)throw new Error((body&&body.error)||'Data service is unavailable ('+r.status+').');
    return body;
  }
  async function loadDates(){
    try{const data=await getJson('/api/police?mode=dates');state.dates=(data.dates||[]).filter(function(x){return /^\d{4}-\d{2}$/.test(x);}).slice(0,18);const sel=$('monthSelect');sel.innerHTML='<option value="">Latest available</option>';state.dates.forEach(function(d){const o=document.createElement('option');o.value=d;o.textContent=new Date(d+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});sel.appendChild(o);});}
    catch(e){toast('Could not check available months: '+e.message,true);}
  }
  async function loadArea(){
    const requestId=++state.requestId,area=Object.assign({},state.area);
    loading(true);
    setText('regionTitle',area.name);setText('exploreRegion',area.name+' / Crime map');
    if(!$('locationInput').matches(':focus'))$('locationInput').value=area.name;
    document.querySelectorAll('[data-place]').forEach(function(n){n.classList.toggle('active',n.dataset.place===area.name.split(',')[0]);});
    centerMaps();
    try{
      const month=state.month||state.dates[0]||'';
      const data=await getJson('/api/police?mode=crimes&lat='+encodeURIComponent(area.lat)+'&lng='+encodeURIComponent(area.lng)+(month?'&date='+encodeURIComponent(month):''));
      if(requestId!==state.requestId)return;
      state.month=data.month||month||'';
      state.crimes=(data.crimes||[]).map(function(c){return {id:c.id,category:c.category||'other-crime',month:c.month||state.month,lat:Number(c.lat),lng:Number(c.lng),street:c.street||'Approximate location',outcome:c.outcome||'Outcome not available'};});
      state.crimes=state.crimes.filter(function(x){return Number.isFinite(x.lat)&&Number.isFinite(x.lng);});
      state.previous=null;state.page=0;state.selected={lat:area.lat,lng:area.lng};state.category='all';state.street='';$('crimeSearch').value='';$('crimeCategory').value='all';$('monthSelect').value=state.month;
      setText('dataMonthMini','POLICE RECORDS · '+state.month);
      setText('datasetLabel','DATA MONTH: '+state.month);
      setText('connectionText','Connected · '+state.month);
      trainModel();updateStats();renderMap();renderModel();renderBreakdown();renderInsights();renderFilter();centerMaps();
      if(state.crimes.length===0)toast('No crime records returned for this area/month. This is not evidence of safety.',true);
      const prevIndex=state.dates.indexOf(state.month),previousMonth=prevIndex>=0?state.dates[prevIndex+1]:null;
      if(previousMonth){getJson('/api/police?mode=count&lat='+encodeURIComponent(area.lat)+'&lng='+encodeURIComponent(area.lng)+'&date='+previousMonth).then(function(result){if(requestId!==state.requestId)return;state.previous={month:previousMonth,count:result.count};updateStats();renderInsights();}).catch(function(){if(requestId===state.requestId)setText('metricTrendFoot','Previous month unavailable');});}
    }catch(e){
      if(requestId!==state.requestId)return;
      state.crimes=[];state.model=null;state.previous=null;state.selected=null;renderMap();updateStats();renderModel();renderBreakdown();renderInsights();renderFilter();setText('connectionText','Police API unavailable');setText('dataMonthMini','DATA UNAVAILABLE');setText('datasetLabel','CONNECTION ERROR');toast('Could not load official records: '+e.message,true);
    }finally{if(requestId===state.requestId)loading(false);}
  }
  function updateStats(){
    const total=state.crimes.length,sorted=countByCategory(state.crimes);
    setText('metricIncidents',format.format(total));setText('metricCategories',format.format(sorted.length));
    setText('metricTop',sorted.length?title(sorted[0][0]):'No records');
    setText('metricTopFoot',sorted.length?format.format(sorted[0][1])+' recorded incidents':'No category data');
    if(state.previous){const n=state.previous.count;if(n===0){setText('metricTrend',total===0?'0%':'N/A');}else{const p=(total-n)/n*100;setText('metricTrend',(p>=0?'+':'')+p.toFixed(1)+'%');}setText('metricTrendFoot','vs '+state.previous.month+' ('+format.format(n)+' incidents)');}
    else {setText('metricTrend','—');setText('metricTrendFoot','Loading comparison / unavailable');}
  }
  function renderBreakdown(){
    const sorted=countByCategory(state.crimes),max=(sorted[0]||[])[1]||1;
    const renderRow=function(item){return '<div class="bar-row"><div class="bar-name"><span>'+escapeHtml(title(item[0]))+'</span><span class="bar-count">'+format.format(item[1])+'</span></div><div class="bar-track"><div style="width:'+Math.round(100*item[1]/max)+'%"></div></div></div>';};
    $('categoryBars').innerHTML=sorted.length?sorted.slice(0,6).map(renderRow).join(''):'<div class="empty-placeholder">No records for this period.</div>';
    $('fullBreakdown').innerHTML=sorted.length?sorted.map(function(i){return '<div class="full-category-row"><span>'+escapeHtml(title(i[0]))+'</span><div><span style="width:'+Math.round(100*i[1]/max)+'%"></span></div><strong>'+format.format(i[1])+' · '+(100*i[1]/state.crimes.length).toFixed(1)+'%</strong></div>';}).join(''):'<div class="empty-placeholder">No records.</div>';
    const cat=$('crimeCategory'),value=state.category;cat.innerHTML='<option value="all">All categories</option>';sorted.forEach(function(i){const op=document.createElement('option');op.value=i[0];op.textContent=title(i[0]);cat.appendChild(op);});cat.value=value;
  }
  function renderInsights(){
    const crimes=state.crimes,sorted=countByCategory(crimes),top=sorted[0],risk=state.selected?riskAt(state.selected.lat,state.selected.lng):null;
    const insights=[];
    if(top)insights.push({symbol:'↗',label:'Largest recorded category',text:title(top[0])+' accounts for '+(100*top[1]/crimes.length).toFixed(1)+'% of the incidents in this dataset.'});
    if(state.previous){const d=crimes.length-state.previous.count;insights.push({symbol:'↕',label:'Month-on-month comparison',text:(d>=0?format.format(d)+' more':format.format(-d)+' fewer')+' recorded incidents than '+state.previous.month+'. Monthly counts can change due to reporting and publication timing.'});}
    if(risk)insights.push({symbol:'◎',label:'Selected location',text:'The model places the point at the '+risk.percentile+'th relative density percentile, within this mapped sample only.'});
    insights.push({symbol:'ⓘ',label:'Important limitation',text:'Recorded-crime coordinates are anonymised and monthly. The model is not evidence that a location is safe or unsafe.'});
    $('insights').innerHTML=insights.map(function(i){return '<div class="insight-item"><span class="insight-icon">'+escapeHtml(i.symbol)+'</span><div><strong>'+escapeHtml(i.label)+'</strong><p>'+escapeHtml(i.text)+'</p></div></div>';}).join('');
  }
  function filteredCrimes(){
    return state.crimes.filter(function(c){return (state.category==='all'||c.category===state.category)&&(!state.street||c.street.toLowerCase().includes(state.street));});
  }
  function renderFilter(){
    const data=filteredCrimes();setText('filterCount',format.format(data.length));const per=7,pages=Math.max(1,Math.ceil(data.length/per));
    state.page=Math.max(0,Math.min(state.page,pages-1));
    setText('pageNumber','Page '+(state.page+1)+' / '+pages);
    $('prevPage').disabled=state.page===0;$('nextPage').disabled=state.page>=pages-1;
    $('incidentList').innerHTML=data.length?data.slice(state.page*per,(state.page+1)*per).map(function(c){
      return '<div class="incident"><div class="incident-row"><strong>'+escapeHtml(title(c.category))+'</strong><span class="incident-tag">'+escapeHtml(c.month)+'</span></div><small>'+escapeHtml(c.street)+' · '+escapeHtml(c.outcome)+'</small></div>';
    }).join(''):'<div class="empty-placeholder" style="padding:25px">No matching records.</div>';
  }
  function resetFilter(){state.page=0;renderFilter();renderMap();}
  async function searchLocation(){
    const raw=$('locationInput').value.trim();
    if(!raw){toast('Enter a town, city or UK postcode.',true);return;}
    const known=Object.keys(places).find(function(s){return s.toLowerCase()===raw.toLowerCase()||places[s].name.toLowerCase()===raw.toLowerCase();});
    if(known){state.area=Object.assign({},places[known]);state.month='';loadArea();return;}
    $('searchButton').disabled=true;
    try{
      let found=null;
      const compact=raw.toUpperCase().replace(/\s/g,'');
      if(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)){
        const result=await getJson('https://api.postcodes.io/postcodes/'+encodeURIComponent(compact));
        if(result.result)found={lat:result.result.latitude,lng:result.result.longitude,name:raw.toUpperCase()};
      }else{
        const results=await getJson('https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&limit=1&q='+encodeURIComponent(raw));
        if(Array.isArray(results)&&results[0])found={lat:Number(results[0].lat),lng:Number(results[0].lon),name:results[0].display_name.split(',').slice(0,2).join(',')};
      }
      if(!found||!Number.isFinite(found.lat)||!Number.isFinite(found.lng))throw new Error('No UK match found. Try a postcode or one of the quick locations.');
      state.area=found;state.month='';loadArea();
    }catch(e){toast('Location search: '+e.message,true);$('searchButton').disabled=false;}
  }
  function geoLocate(){
    if(!navigator.geolocation){toast('Geolocation is not supported by this browser.',true);return;}
    navigator.geolocation.getCurrentPosition(function(pos){
      const lat=pos.coords.latitude,lng=pos.coords.longitude;
      if(lat<49||lat>61||lng< -9||lng>3){toast('This demo currently covers UK police-data locations.',true);return;}
      state.area={lat:lat,lng:lng,name:'My current area'};
      state.month='';navigate('overview');loadArea();toast('Location updated. Historical data is not a live safety assessment.');
    },function(err){toast('Location permission unavailable: '+err.message,true);},{enableHighAccuracy:false,maximumAge:45000,timeout:12000});
  }
  function notifyEntry(risk){
    if(!risk||risk.level<3){state.lastAlertLevel=risk?risk.level:0;return;}
    const now=Date.now();const first=state.lastAlertLevel<3;state.lastAlertLevel=risk.level;
    if(!first||now-state.lastAlertAt<300000)return;
    state.lastAlertAt=now;
    const message='Higher relative recorded-crime density in the loaded area ('+risk.percentile+'th percentile). Historical data only — not a real-time danger warning.';
    toast(message,false);
    if('Notification' in window&&Notification.permission==='granted')new Notification('CrimeScope area alert',{body:message,tag:'crimescope-area-alert'});
  }
  function startAlerts(){
    if(!navigator.geolocation){$('alertToggle').checked=false;toast('Your browser does not support geolocation.',true);return;}
    if('Notification' in window&&Notification.permission==='default')Notification.requestPermission().catch(function(){});
    state.lastAlertLevel=0;
    state.monitor=navigator.geolocation.watchPosition(function(pos){
      const p={lat:pos.coords.latitude,lng:pos.coords.longitude};
      if(distanceKm(p.lat,p.lng,state.area.lat,state.area.lng)>1.3){
        if(Date.now()-state.lastGeoReloadAt>120000){state.lastGeoReloadAt=Date.now();state.area={name:'My monitored area',lat:p.lat,lng:p.lng};state.month='';loadArea();}
        return;
      }
      const risk=riskAt(p.lat,p.lng);
      notifyEntry(risk);
    },function(err){toast('Area monitoring stopped: '+err.message,true);stopAlerts();},{enableHighAccuracy:false,maximumAge:25000,timeout:16000});
    toast('Area alerts enabled while this tab is open. Browser notification permission is optional.');
  }
  function stopAlerts(){if(state.monitor!=null)navigator.geolocation.clearWatch(state.monitor);state.monitor=null;$('alertToggle').checked=false;state.lastAlertLevel=0;}
  function loadNotes(){try{return JSON.parse(localStorage.getItem('crimescope_notes_v1')||'[]');}catch(e){return [];}}
  function saveNotes(notes){try{localStorage.setItem('crimescope_notes_v1',JSON.stringify(notes));return true;}catch(e){toast('Browser storage is unavailable.',true);return false;}}
  function renderNotes(){
    const notes=loadNotes();
    $('savedNotes').innerHTML=notes.length?notes.map(function(n){
      return '<article class="note-card"><div class="note-header"><strong>'+escapeHtml(n.type)+'</strong><small>'+escapeHtml(n.date)+'</small></div><small>'+escapeHtml(n.area)+'</small><p>'+escapeHtml(n.details)+'</p><button data-remove-note="'+escapeHtml(n.id)+'">Delete note</button></article>';
    }).join(''):'<div class="empty-placeholder">No saved observations yet. New notes stay only in this browser.</div>';
  }
  function initEvents(){
    document.querySelectorAll('[data-page]').forEach(function(el){el.addEventListener('click',function(){navigate(el.dataset.page);});});
    document.querySelectorAll('[data-go]').forEach(function(el){el.addEventListener('click',function(){navigate(el.dataset.go);});});
    $('searchButton').addEventListener('click',searchLocation);
    $('locationInput').addEventListener('keydown',function(e){if(e.key==='Enter')searchLocation();});
    document.querySelectorAll('[data-place]').forEach(function(el){el.addEventListener('click',function(){state.area=Object.assign({},places[el.dataset.place]);state.month='';loadArea();});});
    $('geoButton').addEventListener('click',geoLocate);
    $('monthSelect').addEventListener('change',function(){state.month=this.value;loadArea();});
    $('heatMode').addEventListener('click',function(){changeMode('heat');});
    $('pointMode').addEventListener('click',function(){changeMode('points');});
    $('exploreHeat').addEventListener('click',function(){changeMode('heat');});
    $('explorePoints').addEventListener('click',function(){changeMode('points');});
    $('recenterMap').addEventListener('click',centerMaps);
    $('crimeCategory').addEventListener('change',function(){state.category=this.value;resetFilter();});
    $('crimeSearch').addEventListener('input',function(){state.street=this.value.trim().toLowerCase();resetFilter();});
    $('prevPage').addEventListener('click',function(){state.page--;renderFilter();});
    $('nextPage').addEventListener('click',function(){state.page++;renderFilter();});
    $('exportCrimes').addEventListener('click',function(){const data=filteredCrimes();if(!data.length){toast('No records to export.',true);return;}csvDownload('crimescope-'+state.month+'-records.csv',[['Month','Category','Approximate street','Latitude (anonymised)','Longitude (anonymised)','Outcome']].concat(data.map(function(c){return [c.month,title(c.category),c.street,c.lat,c.lng,c.outcome];})));});
    $('exportSummary').addEventListener('click',function(){csvDownload('crimescope-'+state.month+'-categories.csv',[['Category','Incident count','Percent of total']].concat(countByCategory(state.crimes).map(function(c){return [title(c[0]),c[1],state.crimes.length?(100*c[1]/state.crimes.length).toFixed(2):0];})));});
    $('alertToggle').addEventListener('change',function(){this.checked?startAlerts():stopAlerts();});
    $('reportArea').value=state.area.name;
    $('reportForm').addEventListener('submit',function(e){
      e.preventDefault();
      const note={id:String(Date.now())+'-'+Math.random().toString(36).slice(2,8),type:$('reportType').value,area:$('reportArea').value.trim(),details:$('reportDetails').value.trim(),date:new Date().toLocaleString('en-GB')};
      if(!note.type||!note.area||!note.details){toast('Fill in all note fields.',true);return;}
      const notes=loadNotes();notes.unshift(note);
      if(saveNotes(notes)){$('reportForm').reset();$('reportArea').value=state.area.name;renderNotes();toast('Observation saved locally. It has not been reported to police.');}
    });
    $('savedNotes').addEventListener('click',function(e){const btn=e.target.closest('[data-remove-note]');if(btn){saveNotes(loadNotes().filter(function(n){return n.id!==btn.dataset.removeNote;}));renderNotes();toast('Note deleted.');}});
    $('exportNotes').addEventListener('click',function(){const notes=loadNotes();if(!notes.length){toast('No notes to export.',true);return;}csvDownload('crimescope-local-notes.csv',[['Date','Type','Area','Observation']].concat(notes.map(function(n){return [n.date,n.type,n.area,n.details];})));});
  }
  async function start(){
    initEvents();renderNotes();
    if(typeof L==='undefined'){toast('Map library could not load. Check internet access.',true);return;}
    initMaps();
    await loadDates();
    await loadArea();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();