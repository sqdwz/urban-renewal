const $ = (s) => document.querySelector(s);
let currentData = null;
let historyData = null;
let historyIndex = null;
let activeView = 'current';
let activeStatFilter = null;

function esc(v=''){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function fmtDate(v){
  if(!v) return '未明确';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:String(v).includes('T')?'2-digit':undefined,minute:String(v).includes('T')?'2-digit':undefined,hour12:false}).format(d).replaceAll('/','-');
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
function statusText(item){
  if(item._kind==='history'){
    if(/中标|成交/.test(item.notice_type||'')) return '结果公告';
    if(/流标|终止|废标/.test(item.notice_type||'')) return '已结束';
    return item.notice_type||'历史记录';
  }
  return ({active:'在招',awarded:'已中标',ended:'已结束',cancelled:'已终止',pending:'待核验'})[item.status]||item.status||'待核验';
}
function textBlob(item){return [item.title,item.summary,item.notice_type,item.procurement_method,...(item.tags||[])].filter(Boolean).join(' ')}
function deriveProjectType(item){
  if(item.project_type) return item.project_type;
  const t=textBlob(item);
  if(/城中村/.test(t)) return '城中村改造';
  if(/老旧小区/.test(t)) return '老旧小区改造';
  if(/棚户区/.test(t)) return '棚户区改造';
  if(/城市体检/.test(t)) return '城市体检';
  if(/安置区|安置房/.test(t)) return '安置区建设';
  if(/城市更新/.test(t)) return '城市更新';
  return '综合片区改造';
}
function deriveServiceTypes(item){
  if(Array.isArray(item.service_type)&&item.service_type.length) return item.service_type;
  if(typeof item.service_type==='string'&&item.service_type) return [item.service_type];
  const t=textBlob(item);
  const rules=[
    ['实施主体',/实施主体/],['社会稳定风险评估',/社会稳定风险评估|社稳评估|稳评/],['摸底调查',/摸底调查|人房地调查|入户调查/],['测绘',/测绘|测量|地形测量|房屋测绘|土地测绘/],['物探',/物探/],['评估',/评估/],['可研',/可研|可行性研究/],['造价咨询',/造价咨询|全过程造价|造价/],['工程量清单/招标控制价',/工程量清单|招标控制价|最高投标限价/],['EPC',/EPC|设计施工总承包|工程总承包/],['监理',/监理/],['拆除',/拆除|拆迁清运/],['前期物业',/前期物业|物业管理服务/],['招标代理',/招标代理/],['规划',/规划/],['设计',/设计|设计方案|施工图/],['施工',/施工/],['实施方案',/实施方案/],['咨询',/咨询/],['前期策划',/前期服务|前期策划/]
  ];
  const out=[];
  rules.forEach(([name,re])=>{if(re.test(t)) out.push(name)});
  return [...new Set(out.length?out:['咨询'])];
}
function deriveStage(item,services){
  if(item.project_stage) return item.project_stage;
  const s=new Set(services);
  if(item.status==='awarded'||/中标|成交/.test(item.notice_type||'')) return '结果阶段';
  if(s.has('实施主体')||s.has('前期策划')||s.has('可研')||s.has('咨询')) return '前期研究';
  if(s.has('摸底调查')||s.has('评估')||s.has('社会稳定风险评估')) return '征拆前期';
  if(s.has('测绘')||s.has('物探')) return '勘察测绘';
  if(s.has('规划')||s.has('设计')||s.has('实施方案')) return '规划设计';
  if(s.has('造价咨询')||s.has('工程量清单/招标控制价')||s.has('招标代理')) return '建设准备';
  if(s.has('施工')||s.has('EPC')||s.has('监理')||s.has('拆除')) return '建设实施';
  if(s.has('前期物业')) return '运营准备';
  return '前期研究';
}
function deriveCity(item){
  if(item.city) return item.city;
  const r=item.region||'';
  const m=r.match(/(海口市|三亚市|儋州市|琼海市|文昌市|万宁市|东方市|五指山市|澄迈县|定安县|屯昌县|临高县|陵水黎族自治县|保亭黎族苗族自治县|乐东黎族自治县|昌江黎族自治县|白沙黎族自治县|琼中黎族苗族自治县)/);
  return m?m[1]:(r||'未识别');
}
function deriveDistrict(item){
  if(item.district_county) return item.district_county;
  const r=item.region||'';
  const m=r.match(/(秀英区|龙华区|琼山区|美兰区|吉阳区|天涯区|海棠区|崖州区)/);
  return m?m[1]:'';
}
function normalizeItem(item,kind){
  const services=deriveServiceTypes(item);
  let verification=item.verification_status;
  if(!verification){
    if(item.relevance==='expanded') verification='expanded';
    else if(item.source_level==='official'||item.source_level==='official_index') verification='verified';
    else verification='pending_official_backfill';
  }
  return {...item,_kind:kind,project_type:deriveProjectType(item),service_type:services,project_stage:deriveStage(item,services),province:item.province||'海南省',city:deriveCity(item),district_county:deriveDistrict(item),verification_status:verification};
}
function normalizedCurrent(data){
  return {
    active:(data.items||[]).map(x=>normalizeItem(x,'active')),
    events:(data.recent_events||[]).map(x=>normalizeItem(x,'event')),
    expanded:(data.expanded_candidates||[]).map(x=>normalizeItem(x,'expanded'))
  };
}
function currentRecords(){
  if(!currentData) return [];
  const n=normalizedCurrent(currentData);
  return [...n.active,...n.events,...n.expanded];
}
function activeRecords(){return activeView==='history'?(historyData||[]):currentRecords()}
function uniqueValues(values){return [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'zh-CN'))}
function allTags(records){return uniqueValues(records.flatMap(x=>x.tags||[]))}
function allRegions(records){return uniqueValues(records.map(x=>x.city))}
function allProjectTypes(records){return uniqueValues(records.map(x=>x.project_type))}
function allServiceTypes(records){return uniqueValues(records.flatMap(x=>x.service_type||[]))}
function allYears(records){return [...new Set(records.map(x=>(x.publish_date||'').slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))}
function searchable(item){return [item.title,item.project_id,item.region,item.city,item.district_county,item.purchaser,item.winner,item.notice_type,item.procurement_method,item.summary,item.project_type,item.project_stage,...(item.service_type||[]),...(item.tags||[])].filter(Boolean).join(' ').toLowerCase()}
function currentFilters(){return {
  q:$('#searchInput').value.trim().toLowerCase(),
  region:$('#regionFilter').value,
  projectType:$('#projectTypeFilter').value,
  serviceType:$('#serviceTypeFilter').value,
  tag:$('#tagFilter').value,
  year:$('#yearFilter').value,
  verification:$('#verificationFilter').value
}}
function matches(item,f){
  if(f.q&&!searchable(item).includes(f.q)) return false;
  if(f.region&&item.city!==f.region) return false;
  if(f.projectType&&item.project_type!==f.projectType) return false;
  if(f.serviceType&&!(item.service_type||[]).includes(f.serviceType)) return false;
  if(f.tag&&!(item.tags||[]).includes(f.tag)) return false;
  if(activeView==='history'&&f.year&&(item.publish_date||'').slice(0,4)!==f.year) return false;
  if(activeView==='history'&&f.verification&&item.verification_status!==f.verification) return false;
  return true;
}
function currentStatMatches(item){
  if(!activeStatFilter) return true;
  if(activeStatFilter==='new') return item._kind!=='expanded' && (item.is_new_today===true || item.publish_date===currentData.date);
  if(activeStatFilter==='active') return item._kind==='active' && item.status==='active';
  if(activeStatFilter==='deadline') return item._kind==='active' && item.deadline && new Date(item.deadline).getTime()>=Date.now();
  if(activeStatFilter==='expanded') return item._kind==='expanded';
  return true;
}
function historyStatMatches(item){
  if(!activeStatFilter||activeStatFilter==='all') return true;
  if(activeStatFilter==='verified') return item.verification_status==='verified';
  if(activeStatFilter==='pending') return item.verification_status==='pending_official_backfill';
  if(activeStatFilter==='expanded') return item.verification_status==='expanded';
  return true;
}
function amountText(item){
  if(item.award_yuan) return `${money(item.award_yuan)}（成交）`;
  if(item.control_price_yuan) return `${money(item.control_price_yuan)}（控制价）`;
  if(item.budget_yuan) return `${money(item.budget_yuan)}（采购预算）`;
  if(item.project_investment_yuan) return `${money(item.project_investment_yuan)}（项目投资）`;
  return '未披露';
}
function verificationText(item){
  return item.verification_status==='verified'?'已核验':item.verification_status==='expanded'?'扩展候选':'待补官方原文';
}
function renderProject(item){
  const auxTags=(item.tags||[]).filter(t=>t!==item.project_type&&!(item.service_type||[]).includes(t)).slice(0,6).map(t=>`<span class="tag tag-aux">${esc(t)}</span>`).join('');
  const serviceTags=(item.service_type||[]).map(t=>`<span class="tag tag-service">${esc(t)}</span>`).join('');
  const cls=item.verification_status==='expanded'?'expanded':(/中标|成交/.test(item.notice_type||'')||item.status==='awarded')?'awarded':'';
  const statusCls=item.verification_status==='expanded'?'status-expanded':(/中标|成交/.test(item.notice_type||'')||item.status==='awarded')?'status-awarded':'status-active';
  const deadline=item.deadline?`${fmtDate(item.deadline)}${daysLeft(item.deadline)?` · ${daysLeft(item.deadline)}`:''}`:'—';
  const finalFact=(/中标|成交/.test(item.notice_type||'')||item.status==='awarded')?`<div class="fact"><dt>中标单位</dt><dd>${esc(item.winner||'待补充')}</dd></div>`:`<div class="fact"><dt>截止时间</dt><dd>${esc(deadline)}</dd></div>`;
  return `<article class="project ${cls}">
    <div class="project-top">
      <div class="project-title">${esc(item.title||'未命名项目')}</div>
      <div class="tags"><span class="tag ${sourceClass(item)}">${sourceText(item)}</span><span class="tag ${statusCls}">${esc(statusText(item))}</span><span class="tag tag-project">${esc(item.project_type)}</span>${serviceTags}${auxTags}</div>
    </div>
    <div class="project-summary">${esc(item.summary||'暂无摘要')}</div>
    <dl class="facts">
      <div class="fact"><dt>项目类型</dt><dd>${esc(item.project_type)}</dd></div>
      <div class="fact"><dt>服务类型</dt><dd>${esc((item.service_type||[]).join('、')||'未分类')}</dd></div>
      <div class="fact"><dt>项目阶段</dt><dd>${esc(item.project_stage||'未分类')}</dd></div>
      <div class="fact"><dt>地区</dt><dd>${esc([item.city,item.district_county].filter(Boolean).join(' · ')||item.region||'未识别')}</dd></div>
      <div class="fact"><dt>公告类型</dt><dd>${esc(item.notice_type||'未识别')}</dd></div>
      <div class="fact"><dt>项目编号</dt><dd>${esc(item.project_id||'未识别')}</dd></div>
      <div class="fact"><dt>采购方式</dt><dd>${esc(item.procurement_method||'未识别')}</dd></div>
      <div class="fact"><dt>采购人</dt><dd>${esc(item.purchaser||'未披露')}</dd></div>
      <div class="fact"><dt>金额</dt><dd>${amountText(item)}</dd></div>
      <div class="fact"><dt>发布日期</dt><dd>${esc(item.publish_date||'未识别')}</dd></div>
      ${finalFact}
      <div class="fact"><dt>核验状态</dt><dd>${verificationText(item)}</dd></div>
    </dl>
    <div class="project-actions">${item.source_url?`<a class="source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener">查看原文 ↗</a>`:''}</div>
    ${item.verification?`<div class="verify">待核验：${esc(item.verification)}</div>`:''}
  </article>`;
}
function renderCurrentStats(){
  const s=currentData.summary||{};
  const cards=[
    {key:'new',label:'今日新增',value:s.new_today||0,cls:'primary'},
    {key:'active',label:'当前有效',value:s.active_core||0,cls:'good'},
    {key:'deadline',label:'即将截止',value:s.upcoming_deadlines||0,cls:'warn'},
    {key:'expanded',label:'扩展候选',value:s.expanded_candidates||0,cls:''}
  ];
  $('#stats').innerHTML=cards.map(c=>`<button type="button" class="stat ${c.cls} ${activeStatFilter===c.key?'is-selected':''}" data-stat="${c.key}" aria-pressed="${activeStatFilter===c.key}" title="点击筛选，再次点击取消"><b>${c.value}</b><span>${c.label}</span></button>`).join('');
}
function renderHistoryStats(){
  const total=historyData?.length||0;
  const verified=(historyData||[]).filter(x=>x.verification_status==='verified').length;
  const pending=(historyData||[]).filter(x=>x.verification_status==='pending_official_backfill').length;
  const expanded=(historyData||[]).filter(x=>x.verification_status==='expanded').length;
  const cards=[
    {key:'all',label:'历史记录',value:total,cls:'primary'},
    {key:'verified',label:'已核验',value:verified,cls:'good'},
    {key:'pending',label:'待回溯',value:pending,cls:'warn'},
    {key:'expanded',label:'扩展候选',value:expanded,cls:''}
  ];
  $('#stats').innerHTML=cards.map(c=>`<button type="button" class="stat ${c.cls} ${((c.key==='all'&&!activeStatFilter)||activeStatFilter===c.key)?'is-selected':''}" data-stat="${c.key}" aria-pressed="${(c.key==='all'&&!activeStatFilter)||activeStatFilter===c.key}" title="点击筛选"><b>${c.value}</b><span>${c.label}</span></button>`).join('');
}
function fillSelect(el,values,label,current){
  el.innerHTML=`<option value="">${label}</option>`+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(values.includes(current)) el.value=current;
}
function renderFilterOptions(){
  const records=activeRecords();
  const old={region:$('#regionFilter').value,projectType:$('#projectTypeFilter').value,serviceType:$('#serviceTypeFilter').value,tag:$('#tagFilter').value,year:$('#yearFilter').value};
  fillSelect($('#regionFilter'),allRegions(records),'全部地区',old.region);
  fillSelect($('#projectTypeFilter'),allProjectTypes(records),'全部类型',old.projectType);
  fillSelect($('#serviceTypeFilter'),allServiceTypes(records),'全部服务',old.serviceType);
  fillSelect($('#tagFilter'),allTags(records),'全部标签',old.tag);
  fillSelect($('#yearFilter'),allYears(records),'全部年份',old.year);
}
function renderSources(){
  $('#sourceList').innerHTML=(currentData.sources||[]).map(url=>{let name=url;try{name=new URL(url).hostname}catch{}return `<div class="source"><a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(name)}</a></div>`}).join('')||'<div class="empty">暂无来源记录。</div>';
}
function renderCurrent(){
  const f=currentFilters();
  const n=normalizedCurrent(currentData);
  const active=n.active.filter(x=>matches(x,f)&&currentStatMatches(x));
  const events=n.events.filter(x=>matches(x,f)&&currentStatMatches(x));
  const expanded=n.expanded.filter(x=>matches(x,f)&&currentStatMatches(x));
  $('#activeSection').hidden=activeStatFilter==='expanded';
  $('#eventSection').hidden=['active','deadline','expanded'].includes(activeStatFilter);
  $('#expandedSection').hidden=['new','active','deadline'].includes(activeStatFilter);
  $('#activeCount').textContent=active.length;
  $('#eventCount').textContent=events.length;
  $('#expandedCount').textContent=expanded.length;
  $('#activeList').innerHTML=active.length?active.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的核心在招项目。</div>';
  $('#eventList').innerHTML=events.length?events.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的近期结果事件。</div>';
  $('#expandedList').innerHTML=expanded.length?expanded.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的扩展候选。</div>';
  renderCurrentStats();
  renderFilterHint(active.length+events.length+expanded.length,f);
}
function renderHistory(){
  const f=currentFilters();
  const rows=(historyData||[]).filter(x=>matches(x,f)&&historyStatMatches(x)).sort((a,b)=>(b.publish_date||'').localeCompare(a.publish_date||''));
  $('#historyCount').textContent=rows.length;
  $('#historyList').innerHTML=rows.length?rows.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的历史项目。</div>';
  renderHistoryStats();
  renderFilterHint(rows.length,f);
}
function renderFilterHint(total,f){
  const parts=[];
  if(activeStatFilter) parts.push(`快速筛选“${activeView==='history'?({all:'全部历史',verified:'已核验',pending:'待回溯',expanded:'扩展候选'}[activeStatFilter]||activeStatFilter):({new:'今日新增',active:'当前有效',deadline:'即将截止',expanded:'扩展候选'}[activeStatFilter]||activeStatFilter)}”`);
  if(f.q)parts.push(`关键词“${esc(f.q)}”`);
  if(f.region)parts.push(`地区“${esc(f.region)}”`);
  if(f.projectType)parts.push(`项目类型“${esc(f.projectType)}”`);
  if(f.serviceType)parts.push(`服务“${esc(f.serviceType)}”`);
  if(f.tag)parts.push(`标签“${esc(f.tag)}”`);
  if(activeView==='history'&&f.year)parts.push(`年份“${esc(f.year)}”`);
  if(activeView==='history'&&f.verification)parts.push(`核验“${esc($('#verificationFilter').selectedOptions[0]?.textContent||f.verification)}”`);
  $('#filterHint').innerHTML=parts.length?`当前筛选：${parts.join(' · ')}，共显示 <strong>${total}</strong> 条。`:`共显示 <strong>${total}</strong> 条。`;
}
function renderSummary(){
  if(activeView==='current'){
    const s=currentData.summary||{};
    $('#meta').textContent=`巡检日期：${currentData.date||'未知'} ｜ 数据生成：${fmtDate(currentData.generated_at||'')} ｜ 海南省城市更新相关公开招投标信息`;
    $('#summary').innerHTML=`<strong>${esc(s.note||'暂无巡检摘要。')}</strong><br>核心项目与扩展候选分开统计；第三方聚合信息仅作线索，优先回溯官方原文。`;
  }else{
    const w=historyIndex?.window||{};
    const s=historyIndex?.summary||{};
    $('#meta').textContent=`历史范围：${w.start_date||'2023-08-27'} 至 ${w.end_date||'2026-08-27'} ｜ 当前历史基线 ${historyData?.length||0} 条`;
    $('#summary').innerHTML=`<strong>近三年历史库已接入 ${historyData?.length||0} 条记录。</strong><br>其中已核验 ${s.verified_or_official_index??(historyData||[]).filter(x=>x.verification_status==='verified').length} 条，待补官方原文 ${s.secondary_pending_backfill??(historyData||[]).filter(x=>x.verification_status==='pending_official_backfill').length} 条，扩展候选 ${s.expanded_candidates??(historyData||[]).filter(x=>x.verification_status==='expanded').length} 条。历史库为持续补录基线，不宣称穷尽所有存量公告。`;
  }
}
function render(){
  renderSummary();
  renderFilterOptions();
  if(activeView==='current') renderCurrent(); else renderHistory();
}
function clearFilters(){
  ['searchInput','regionFilter','projectTypeFilter','serviceTypeFilter','tagFilter','yearFilter','verificationFilter'].forEach(id=>{const el=$('#'+id);if(el) el.value=''});
  activeStatFilter=null;
}
function switchView(view){
  if(view===activeView) return;
  activeView=view;
  clearFilters();
  $('#currentView').hidden=view!=='current';
  $('#historyView').hidden=view!=='history';
  document.querySelectorAll('.history-only').forEach(el=>el.hidden=view!=='history');
  document.querySelectorAll('.view-tab').forEach(btn=>{const on=btn.dataset.view===view;btn.classList.toggle('is-active',on);btn.setAttribute('aria-pressed',String(on))});
  render();
}
async function fetchJson(path){
  const r=await fetch(`${path}${path.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store'});
  if(!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}
async function loadHistory(){
  historyIndex=await fetchJson('./data/history/index.json');
  const datasets=await Promise.all((historyIndex.datasets||[]).map(d=>fetchJson(`./${d.path}`)));
  const raw=[];
  datasets.forEach(d=>{
    if(Array.isArray(d.projects)) raw.push(...d.projects);
    if(Array.isArray(d.records)) raw.push(...d.records);
  });
  const seen=new Set();
  historyData=raw.filter(x=>{const key=x.id||[x.project_id,x.title,x.publish_date].join('|');if(seen.has(key))return false;seen.add(key);return true}).map(x=>normalizeItem(x,'history'));
  $('#historyTabCount').textContent=historyData.length;
}
async function load(){
  try{
    const [latest]=await Promise.all([fetchJson('./data/latest.json'),loadHistory()]);
    currentData=latest;
    renderSources();
    render();
  }catch(err){
    $('#summary').textContent=`数据读取失败：${err.message}`;
    $('#activeList').innerHTML='<div class="empty">请刷新页面重试。</div>';
  }
}

$('#stats')?.addEventListener('click',e=>{
  const btn=e.target.closest('.stat[data-stat]');
  if(!btn) return;
  const key=btn.dataset.stat;
  if(activeView==='history') activeStatFilter=key==='all'?null:(activeStatFilter===key?null:key);
  else activeStatFilter=activeStatFilter===key?null:key;
  activeView==='current'?renderCurrent():renderHistory();
});
['searchInput','regionFilter','projectTypeFilter','serviceTypeFilter','tagFilter','yearFilter','verificationFilter'].forEach(id=>$('#'+id)?.addEventListener(id==='searchInput'?'input':'change',()=>{if(!currentData)return;activeView==='current'?renderCurrent():renderHistory()}));
$('#clearBtn')?.addEventListener('click',()=>{clearFilters();render()});
$('#refreshBtn')?.addEventListener('click',load);
document.querySelectorAll('.view-tab').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
load();
