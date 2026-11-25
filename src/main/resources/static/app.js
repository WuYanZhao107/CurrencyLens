const $ = id => document.getElementById(id);
let points = [], basePoints = [], referencePoints = [], chartSource = 'reference', seriesRequestId = 0, requestedSeries = '', custom = false, requestId = 0, pair = 'audCny', days = 30, events = [], eventErrors = [], eventsReady = false, selectedDate = null;
const labels = {audCny:'AUD / CNY', usdCny:'USD / CNY', audUsd:'AUD / USD'};
const relevant = {audCny:['AUD'], usdCny:['USD'], audUsd:['AUD','USD']};
const signed = x => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateValue = d => Date.parse(d+'T00:00:00Z');
async function api(path){const r=await fetch(path);if(!r.ok) throw Error('数据暂时不可用');return r.json()}
const pairSymbols = {audCny:'AUD/CNY', usdCny:'USD/CNY', audUsd:'AUD/USD'};
const quoteOrder = ['USD/CNY','AUD/CNY','AUD/USD'];
const quoteData = new Map();
function renderQuotes(){
    $('ticker').innerHTML = quoteOrder.map(symbol => {
        const d=quoteData.get(symbol);
        if(!d)return `<article class="quote"><span class="quote-name">${esc(symbol)}</span><div class="loading">加载中…</div></article>`;
        if(d.error)return `<article class="quote"><span class="quote-name">${esc(symbol)}</span><div class="loading">获取失败，请选择后刷新。</div></article>`;
        const q=d.quotes[0];
        return `<article class="quote ${pairSymbols[pair]===symbol?'quote-selected':''}"><div class="quote-top"><span class="quote-name">${esc(symbol)}</span><span class="badge">${d.mode==='live'?'Twelve Data':'Frankfurter / ECB'}</span></div><div class="quote-value">${Number(q.rate).toFixed(4)}</div><div class="quote-bottom"><span>1 ${esc(symbol.split('/')[0])} 兑换 ${esc(symbol.split('/')[1])}</span><span>${esc(q.time)}${d.mode==='live'?' (UTC)':''}</span></div></article>`;
    }).join('');
    const selected=quoteData.get(pairSymbols[pair]);
    $('mode').textContent='● 选中 '+labels[pair]+' · 点击按钮刷新';
    $('quoteNote').textContent=selected&&!selected.error?selected.message:'切换走势图货币对后，可单独刷新对应汇率。';
    $('refresh').textContent='↻ 刷新 '+labels[pair];
}
async function loadQuote(symbol){
    try {
        const result=await api('/api/market/quote?pair='+encodeURIComponent(symbol));
        quoteData.set(symbol,result);
        if(symbol===pairSymbols[pair] && referencePoints.length) {
            if(result.mode==='live' && chartSource!=='twelve') loadSeries();
            else if(result.mode!=='live' && chartSource==='twelve') useReference('外部报价暂不可用，走势图显示 ECB 参考汇率');
            else draw();
        }
        $('checked').textContent='最近检查：'+new Date().toLocaleTimeString('zh-CN');
    } catch(e) {
        if(!quoteData.has(symbol))quoteData.set(symbol,{error:true});
        if(symbol===pairSymbols[pair])$('checked').textContent='更新失败，请稍后重试';
    }
    renderQuotes();
}
async function refreshSelected(){
    const button=$('refresh'), symbol=pairSymbols[pair];
    button.disabled=true;
    try {await loadQuote(symbol)} finally {button.disabled=false}
}
function loadInitialQuotes(){renderQuotes();quoteOrder.forEach(loadQuote)}
async function loadHistory(){try{const d=await api('/api/market/history');basePoints=d.points;if(custom)return;referencePoints=basePoints;points=referencePoints;if(!selectedDate)selectedDate=points.at(-1).date;$('eventDate').min=points[0].date;$('eventDate').max=points.at(-1).date;$('eventDate').value=selectedDate;draw();renderEvents();experiment();loadSeries()}catch(e){$('chart').textContent='历史数据加载失败，请稍后重试。'}}
function useReference(message){seriesRequestId++;requestedSeries='';chartSource='reference';points=referencePoints;$('chartSource').textContent=message||'每日参考汇率 · ECB via Frankfurter';draw();experiment()}
async function loadSeries(){
    if(!referencePoints.length)return;
    const selected=pairSymbols[pair], q=quoteData.get(selected);
    if(!q || q.mode!=='live'){useReference('每日参考汇率 · ECB via Frankfurter');return}
    const from=referencePoints[0].date;
    const today=new Date().toISOString().slice(0,10);
    const to=(!custom || $('toMonth').value===today.slice(0,7))?today:referencePoints.at(-1).date;
    const requestKey=selected+':'+from+':'+to;
    if(requestKey===requestedSeries)return;
    requestedSeries=requestKey;const id=++seriesRequestId, activePair=pair;
    chartSource='reference';points=referencePoints;$('chartSource').textContent='正在获取 Twelve Data 日线…';draw();
    try {
        const result=await api(`/api/market/series?pair=${encodeURIComponent(selected)}&from=${from}&to=${to}`);
        if(id!==seriesRequestId || activePair!==pair)return;
        if(result.points.length<2)throw Error('历史数据不足');
        points=result.points.map(item=>({date:item.date,[activePair]:item.rate}));
        chartSource='twelve';$('chartSource').textContent='Twelve Data · 日线收盘价';
        draw();experiment();
    } catch(e){if(id===seriesRequestId){useReference('Twelve Data 历史数据暂不可用 · 显示 ECB 参考汇率，与上方报价来源不同')}}
}
async function loadEvents(){try{const d=await api('/api/market/events');events=d.events;eventErrors=d.errors;eventsReady=true;$('eventStatus').textContent=d.coverage+(eventErrors.length?' '+eventErrors.join('；'):'')+' 人民币与其他国际新闻尚未覆盖。';renderEvents();experiment()}catch(e){eventErrors=['历史公告暂时不可用'];eventsReady=true;$('eventStatus').textContent=eventErrors[0];$('news').textContent='历史公告加载失败，请稍后重试。';experiment()}}
function renderEvents(){if(!selectedDate||!eventsReady)return;const coverageYear=new Date().getUTCFullYear()-2;if(Number(selectedDate.slice(0,4))<coverageYear){$('eventCaption').textContent=`${labels[pair]} · ${selectedDate}`;$('news').innerHTML=`<p class="muted">此日期的央行历史公告暂未接入（当前覆盖 ${coverageYear} 年起）；不代表当时没有新闻。</p>`;return;}const end=dateValue(selectedDate),begin=end-7*86400000;const matched=events.filter(e=>relevant[pair].includes(e.category)&&dateValue(e.date)>=begin&&dateValue(e.date)<=end);$('eventCaption').textContent=`${labels[pair]} · ${selectedDate} 及此前 7 天 · ${matched.length} 条线索`;$('news').innerHTML=matched.length?matched.slice(0,10).map(e=>`<article class="story"><div class="story-meta"><span>${esc(e.source)}</span><span>${esc(e.date)}</span></div><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)} ↗</a><div class="story-reason">关联依据：${e.category==='AUD'?'澳元相关央行公告':'美元相关央行公告'}，日期在观察窗口内；影响方向和因果关系未知。</div></article>`).join(''):'<p class="muted">这个时间窗口没有找到已覆盖的相关央行公告。并不代表当时没有其他重要新闻。</p>'}
function draw(){
    if(points.length<2){$('chart').textContent='所选区间的汇率数据不足。';return}
    const end=dateValue(points.at(-1).date), start=custom?dateValue(points[0].date):end-days*86400000;
    let data=points.filter(p=>dateValue(p.date)>=start).map(p=>({...p}));
    const q=quoteData.get(pairSymbols[pair]), quote=q?.quotes?.[0], quoteDate=quote?.time?.slice(0,10);
    const currentRange=!custom || $('toMonth').value===new Date().toISOString().slice(0,7);
    if(chartSource==='twelve' && currentRange && q?.mode==='live' && quoteDate && data.length && quoteDate>=data.at(-1).date && quoteDate<=new Date().toISOString().slice(0,10)){
        const live={date:quoteDate,[pair]:Number(quote.rate),live:true,quoteTime:quote.time};
        if(quoteDate===data.at(-1).date)data[data.length-1]=live;else data.push(live);
    }
    if(data.length<2){$('chart').textContent='所选区间的汇率数据不足。';return}
    $('chartTiming').textContent=data.some(p=>p.live)?'日线 + 当前报价（按需刷新）':'历史日线数据';
    if(chartSource==='twelve')$('chartSource').textContent=data.some(p=>p.live)?'Twelve Data · 日线收盘价 + 当前报价':'Twelve Data · 日线收盘价';
    if(data.some(p=>p.live) && data.at(-1).date>$('eventDate').max)$('eventDate').max=data.at(-1).date;
    const v=data.map(p=>Number(p[pair]));
    const lowIndex=v.indexOf(Math.min(...v)), highIndex=v.indexOf(Math.max(...v));
    const min=v[lowIndex],max=v[highIndex], pad=(max-min)*.22||Math.max(Math.abs(max)*.01,.01), lo=min-pad,hi=max+pad;
    const left=70,right=775,top=30,bottom=185,t0=dateValue(data[0].date),t1=dateValue(data.at(-1).date);
    const xy=data.map(p=>[left+(dateValue(p.date)-t0)/(t1-t0)*(right-left),bottom-(Number(p[pair])-lo)/(hi-lo)*(bottom-top)]);
    const line=xy.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    let axes='';
    for(let i=0;i<5;i++){const y=top+i*(bottom-top)/4,val=hi-i*(hi-lo)/4;axes+=`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e6eee7" stroke-dasharray="4 5"/><text x="${left-9}" y="${y+4}" text-anchor="end" class="axis-label">${val.toFixed(4)}</text>`}
    for(let i=0;i<5;i++){const x=left+i*(right-left)/4, iso=new Date(t0+i*(t1-t0)/4).toISOString(), date=(t1-t0>365*86400000)?iso.slice(0,7):iso.slice(5,10);axes+=`<text x="${x}" y="220" text-anchor="middle" class="axis-label">${date}</text>`}
    const mark=(index, high)=>{const [x,y]=xy[index], same=highIndex===lowIndex, posY=Math.min(205,Math.max(14,y+(high?-10:17)+(same&&!high?9:0))), anchor=x>right-115?'end':'start', tx=x+(anchor==='end'?-8:8),color=high?'#30945e':'#dc655a';return `<circle cx="${x}" cy="${y}" r="5" fill="${color}" stroke="white" stroke-width="2"/><text x="${tx}" y="${posY}" text-anchor="${anchor}" class="extrema-label" fill="${color}">${high?'最高':'最低'} ${v[index].toFixed(6)}</text>`};
    $('chart').innerHTML=`<svg id="chartSvg" viewBox="0 0 800 230" preserveAspectRatio="none" role="img" aria-label="${labels[pair]}历史走势：横轴日期，纵轴汇率，区间最高 ${max.toFixed(6)}，最低 ${min.toFixed(6)}"><defs><linearGradient id="shade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8fbd7a" stop-opacity=".23"/><stop offset="1" stop-color="#8fbd7a" stop-opacity="0"/></linearGradient></defs>${axes}<path d="${line} L${right},${bottom} L${left},${bottom} Z" fill="url(#shade)"/><path d="${line}" fill="none" stroke="#77a96d" stroke-width="2.5" vector-effect="non-scaling-stroke"/>${mark(highIndex,true)}${mark(lowIndex,false)}<line id="crosshair" x1="0" x2="0" y1="${top}" y2="${bottom}" stroke="#527c5a" stroke-dasharray="3 3" visibility="hidden"/><circle id="dot" r="4" fill="#487e4d" visibility="hidden"/><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="transparent" id="hitbox"/></svg><div class="chart-tip" id="chartTip" hidden></div>`;
    const change=(v.at(-1)/v[0]-1)*100;$('chartPair').textContent=labels[pair];$('chartValue').textContent=v.at(-1).toFixed(4);$('chartChange').textContent=signed(change)+' 区间变化';$('chartChange').className='change '+(change>=0?'up':'down');$('firstDate').textContent=data[0].date;$('lastDate').textContent=data.at(-1).date;
    const svg=$('chartSvg'),tip=$('chartTip');let active=0;
    function hover(e){const rect=svg.getBoundingClientRect(), x=(e.clientX-rect.left)/rect.width*800;active=xy.reduce((best,p,i)=>Math.abs(p[0]-x)<Math.abs(xy[best][0]-x)?i:best,0);const [px,py]=xy[active];$('crosshair').setAttribute('x1',px);$('crosshair').setAttribute('x2',px);$('crosshair').setAttribute('visibility','visible');$('dot').setAttribute('cx',px);$('dot').setAttribute('cy',py);$('dot').setAttribute('visibility','visible');tip.hidden=false;tip.innerHTML=`${esc(data[active].date)}${data[active].live?' · 当前报价 '+esc(data[active].quoteTime)+' (UTC)':''}<br><strong>${esc(labels[pair])} &nbsp; ${v[active].toFixed(6)}</strong><br><small>点击查看当时事件</small>`;tip.style.left=Math.min(Math.max((px/800)*100,16),82)+'%';tip.style.top=Math.max(4,(py/230)*100-22)+'%'}
    svg.addEventListener('pointermove',hover);svg.addEventListener('pointerleave',()=>{tip.hidden=true;$('crosshair').setAttribute('visibility','hidden');$('dot').setAttribute('visibility','hidden')});svg.addEventListener('click',e=>{hover(e);selectedDate=data[active].date;$('eventDate').value=selectedDate;renderEvents();experiment()});
}
// As-of discipline: an event is usable only if its date is strictly before the observation date.
function eventFlag(date){const t=dateValue(date);return events.some(e=>relevant[pair].includes(e.category)&&dateValue(e.date)<t&&dateValue(e.date)>=t-7*86400000)}
function experiment(){if(points.length<25||!selectedDate||!eventsReady){return}if(eventErrors.length){$('direction').textContent='—';$('accuracy').textContent='—';$('samples').textContent='—';$('experimentNote').textContent='历史事件数据不完整，暂停事件条件预测；请稍后重试。';return}const coverageStart=`${new Date().getUTCFullYear()-2}-01-08`;if(selectedDate<coverageStart){$('direction').textContent=$('accuracy').textContent=$('samples').textContent='—';$('experimentNote').textContent=`该时期的公告数据尚未覆盖（现有数据从 ${coverageStart} 起），无法计算事件预测。`;return}const data=points.filter(p=>p.date>=coverageStart&&p.date<=selectedDate);if(data.length<25){$('experimentNote').textContent='观察日期之前的历史样本不足。';$('direction').textContent=$('accuracy').textContent=$('samples').textContent='—';return}let buckets=[[0,0],[0,0]],hits=0,baseHits=0,n=0;for(let i=1;i<data.length-1;i++){const flag=eventFlag(data[i].date)?1:0;const outcome=Math.sign(Number(data[i+1][pair])-Number(data[i][pair]));const previous=Math.sign(Number(data[i][pair])-Number(data[i-1][pair]));const bucket=buckets[flag];if(outcome!==0&&previous!==0&&bucket[1]>=20){const guess=bucket[0]/bucket[1]>=.5?1:-1;hits+=guess===outcome?1:0;baseHits+=previous===outcome?1:0;n++}if(outcome!==0){bucket[1]++;if(outcome>0)bucket[0]++}}const current=buckets[eventFlag(data.at(-1).date)?1:0];$('direction').textContent=current[1]>=20?(current[0]/current[1]*100).toFixed(1)+'%':'样本不足';$('accuracy').textContent=n?(hits/n*100).toFixed(1)+'%':'样本不足';$('samples').textContent=n?(baseHits/n*100).toFixed(1)+'%':'样本不足';$('experimentNote').textContent=`截至 ${data.at(-1).date}：最近 7 天${eventFlag(data.at(-1).date)?'有':'无'}已覆盖的相关央行公告；同类样本 ${current[1]} 次。滚动回测 ${n} 次，基线为沿用上一次涨跌方向。同日公告排除，样本小且未验证新闻效果，不能作为交易依据。`}
$('pairs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;pair=b.dataset.pair;renderQuotes();document.querySelectorAll('#pairs button').forEach(x=>x.classList.toggle('selected',x===b));useReference('正在选择数据源…');renderEvents();loadSeries()});$('range').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;requestId++;custom=false;referencePoints=basePoints;points=referencePoints;if(points.length){$("eventDate").min=points[0].date;$("eventDate").max=points.at(-1).date}days=Number(b.dataset.days);selectedDate=points.at(-1)?.date||null;$('eventDate').value=selectedDate;$('rangeStatus').textContent='最多可查看过去 20 年';document.querySelectorAll('#range button').forEach(x=>x.classList.toggle('selected',x===b));useReference();renderEvents();loadSeries()});$('eventDate').addEventListener('change',e=>{selectedDate=e.target.value;renderEvents();experiment()});$('refresh').addEventListener('click',refreshSelected);loadInitialQuotes();loadHistory();loadEvents();

const now=new Date(), currentMonth=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
const earliest=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-239,1));
const earliestMonth=earliest.toISOString().slice(0,7);
for(const input of [$('fromMonth'),$('toMonth')]){input.min=earliestMonth;input.max=currentMonth}
$('fromMonth').value=`${now.getUTCFullYear()-1}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;$('toMonth').value=currentMonth;
$('customRange').addEventListener('submit',async e=>{e.preventDefault();const from=$('fromMonth').value,to=$('toMonth').value;
    if(!from||!to||from>to||from<earliestMonth||to>currentMonth){$('rangeStatus').textContent='请选择过去 20 年内的有效月份，开始不得晚于结束。';return}
    const id=++requestId;$('rangeStatus').textContent='正在获取历史汇率…';
    try{const result=await api(`/api/market/history/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);if(id!==requestId)return;if(result.points.length<2){$('rangeStatus').textContent='此区间数据不足，请选择其他月份。';return}custom=true;referencePoints=result.points;points=referencePoints;selectedDate=points.at(-1).date;$('eventDate').min=points[0].date;$('eventDate').max=points.at(-1).date;$('eventDate').value=selectedDate;document.querySelectorAll('#range button').forEach(x=>x.classList.remove('selected'));$('rangeStatus').textContent=`已显示 ${from} 至 ${to} · 历史日线`;useReference();renderEvents();loadSeries()}
    catch(err){if(id===requestId)$('rangeStatus').textContent='历史数据暂时无法获取，请稍后重试。'}
});
