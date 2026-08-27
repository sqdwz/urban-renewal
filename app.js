const $ = (s) => document.querySelector(s);
let latestData = null;

function esc(v=''){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function fmtDate(v){
  if(!v) return '未明确';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:v.includes('T')?'2-digit':undefined,minute:v.includes('T')?'2-digit':undefined,hour12:false}).format(d).replaceAll('/','-');
}
function money(v){
  if(v===null||v===undefined||v==='') return '未披露';
  const n=Number(v); if(!Number.isFinite(n)) return String(v);
  if(n>=100000000) return `${(n/100000000).toFixed(2).replace(/\.00$/,'')}亿元`;
  if(n>=10000) return `${(n/10000).toFixed(2).replace(/\.00$/,'')}万元`;
  return `${n.toLocaleString('zh-CN')}元`;
}
function daysLeft(v){
  if(!v) return '';
  const end=new Date(v); if(Number.isNaN(end.getTime())) return '';
  const diff=Math.ceil((end-Date.now())/86400000);
  if(diff<0) return '已截止';
  if(diff===0) return '今日截止';
  return `剩余 ${diff} 天`;
}
function sourceClass(item){return item.source_level==='official'||item.source_level==='official_index'?'source-official':'source-secondary'}
function sourceText(item){return item.source_level==='official'||item.source_level==='official_index'?'官方来源':'补充来源'}
function statusText(item){return ({active:'在招',awarded:'已中标'})[item.status]||item.status||'待核验'}
function allTags(data){return [...new Set([...(data.items||[]),...(data.recent_events||[]),...(data.expanded_candidates||[])].flatMap(x=>x.tags||[]))].sort()}
function allRegions(data){return [...new Set([...(data.items||[]),...(data.recent_events||[]),...(data.expanded_candidates||[])].map(x=>x.region).filter(Boolean))].sort()}
function searchable(item){return [item.title,item.project_id,item.region,item.purchaser,item.winner,item.notice_type,item.procurement_method,item.summary,...(item.tags||[])].filter(Boolean).join(' ').toLowerCase()}
function currentFilters(){return {q:$('#searchInput').value.trim().toLowerCase(),region:$('#regionFilter').value,tag:$('#tagFilter').value}}
function matches(item,f){
  if(f.q&&!searchable(item).includes(f.q)) return false;
  if(f.region&&item.region!==f.region) return false;
  if(f.tag&&!(item.tags||[]).includes(f.tag)) return false;
  return true;
}
function renderProject(item,kind='active'){
  const tags=(item.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('');
  const cls=kind==='expanded'?'expanded':item.status==='awarded'?'awarded':'';
  const statusCls=kind==='expanded'?'status-expanded':item.status==='awarded'?'status-awarded':'status-active';
  const deadline=item.deadline?`${fmtDate(item.deadline)}${daysLeft(item.deadline)?` · ${daysLeft(item.deadline)}`:''}`:'—';
  return `<article class="project ${cls}">
    <div class="project-top">
      <div class="project-title">${esc(item.title||'未命名项目')}</div>
      <div class="tags"><span class="tag ${sourceClass(item)}">${sourceText(item)}</span><span class="tag ${statusCls}">${kind==='expanded'?'扩展候选':statusText(item)}</span>${tags}</div>
    </div>
    <div class="project-summary">${esc(item.summary||'暂无摘要')}</div>
    <dl class="facts">
      <div class="fact"><dt>地区</dt><dd>${esc(item.region||'未识别')}</dd></div>
      <div class="fact"><dt>公告类型</dt><dd>${esc(item.notice_type||'未识别')}</dd></div>
      <div class="fact"><dt>项目编号</dt><dd>${esc(item.project_id||'未识别')}</dd></div>
      <div class="fact"><dt>采购方式</dt><dd>${esc(item.procurement_method||'未识别')}</dd></div>
      <div class="fact"><dt>采购人</dt><dd>${esc(item.purchaser||'未披露')}</dd></div>
      <div class="fact"><dt>预算/成交</dt><dd>${item.award_yuan?`${money(item.award_yuan)}（成交）`:money(item.budget_yuan)}</dd></div>
      <div class="fact"><dt>发布日期</dt><dd>${esc(item.publish_date||'未识别')}</dd></div>
      <div class="fact"><dt>${item.status==='awarded'?'中标单位':'截止时间'}</dt><dd>${item.status==='awarded'?esc(item.winner||'待补充'):esc(deadline)}</dd></div>
    </dl>
    <div class="project-actions">${item.source_url?`<a class="source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener">查看原文 ↗</a>`:''}</div>
    ${item.verification?`<div class="verify">待核验：${esc(item.verification)}</div>`:''}
  </article>`;
}
function renderStats(data){
  const s=data.summary||{};
  const cards=[['今日新增',s.new_today||0,'primary'],['当前有效',s.active_core||0,'good'],['即将截止',s.upcoming_deadlines||0,'warn'],['扩展候选',s.expanded_candidates||0,'']];
  $('#stats').innerHTML=cards.map(([label,value,cls])=>`<div class="stat ${cls}"><b>${value}</b><span>${label}</span></div>`).join('');
}
function renderSources(data){
  $('#sourceList').innerHTML=(data.sources||[]).map(url=>{let name=url;try{name=new URL(url).hostname}catch{}return `<div class="source"><a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(name)}</a></div>`}).join('')||'<div class="empty">暂无来源记录。</div>';
}
function renderFilters(data){
  const r=$('#regionFilter'),t=$('#tagFilter'); const rv=r.value,tv=t.value;
  r.innerHTML='<option value="">全部地区</option>'+allRegions(data).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  t.innerHTML='<option value="">全部标签</option>'+allTags(data).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(allRegions(data).includes(rv)) r.value=rv; if(allTags(data).includes(tv)) t.value=tv;
}
function renderLists(data){
  const f=currentFilters();
  const active=(data.items||[]).filter(x=>matches(x,f));
  const events=(data.recent_events||[]).filter(x=>matches(x,f));
  const expanded=(data.expanded_candidates||[]).filter(x=>matches(x,f));
  $('#activeCount').textContent=active.length; $('#eventCount').textContent=events.length; $('#expandedCount').textContent=expanded.length;
  $('#activeList').innerHTML=active.length?active.map(x=>renderProject(x,'active')).join(''):'<div class="empty">暂无符合筛选条件的核心在招项目。</div>';
  $('#eventList').innerHTML=events.length?events.map(x=>renderProject(x,'event')).join(''):'<div class="empty">暂无符合筛选条件的近期结果事件。</div>';
  $('#expandedList').innerHTML=expanded.length?expanded.map(x=>renderProject(x,'expanded')).join(''):'<div class="empty">暂无符合筛选条件的扩展候选。</div>';
  const parts=[]; if(f.q)parts.push(`关键词“${esc(f.q)}”`); if(f.region)parts.push(`地区“${esc(f.region)}”`); if(f.tag)parts.push(`标签“${esc(f.tag)}”`);
  $('#filterHint').innerHTML=parts.length?`当前筛选：${parts.join(' · ')}，共显示 ${active.length+events.length+expanded.length} 条。`:'';
}
function render(data){
  latestData=data;
  $('#meta').textContent=`巡检日期：${data.date||'未知'} ｜ 数据生成：${fmtDate(data.generated_at||'')} ｜ 海南省城市更新相关公开招投标信息`;
  const s=data.summary||{};
  $('#summary').innerHTML=`<strong>${s.note||'暂无巡检摘要。'}</strong><br>核心项目与扩展候选分开统计；第三方聚合信息仅作线索，优先回溯官方原文。`;
  renderStats(data); renderFilters(data); renderLists(data); renderSources(data);
}
async function load(){
  try{
    const r=await fetch(`./data/latest.json?t=${Date.now()}`,{cache:'no-store'}); if(!r.ok)throw new Error(`HTTP ${r.status}`);
    render(await r.json());
  }catch(err){
    $('#summary').textContent=`最新数据读取失败：${err.message}`;
    $('#activeList').innerHTML='<div class="empty">请稍后刷新页面。</div>';
  }
}
['searchInput','regionFilter','tagFilter'].forEach(id=>$('#'+id)?.addEventListener(id==='searchInput'?'input':'change',()=>latestData&&renderLists(latestData)));
$('#clearBtn')?.addEventListener('click',()=>{ $('#searchInput').value='';$('#regionFilter').value='';$('#tagFilter').value='';if(latestData)renderLists(latestData)});
$('#refreshBtn')?.addEventListener('click',load);
load();
