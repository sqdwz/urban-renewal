const $ = (s) => document.querySelector(s);
let latestData = null;
let activeStatFilter = null;

const PROJECT_TYPES = ['城市更新','城中村改造','老旧小区改造','棚户区改造','城市体检','安置区建设','综合片区改造'];
const SERVICE_TYPES = ['前期策划','实施主体','摸底调查','测绘','物探','评估','社会稳定风险评估','可研','咨询','实施方案','规划','设计','造价咨询','工程量清单/招标控制价','施工','EPC','监理','拆除','前期物业','招标代理'];

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
function statusText(item){return ({active:'在招',awarded:'已中标',ended:'已结束',cancelled:'已终止',pending:'待核验'})[item.status]||item.status||'待核验'}

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
    ['实施主体',/实施主体/],['社会稳定风险评估',/社会稳定风险评估|社稳评估|稳评/],['摸底调查',/摸底调查|人房地调查|入户调查/],['测绘',/测绘|测量|地形测量|房屋测绘|土地测绘/],['物探',/物探/],['评估',/评估/],['可研',/可研|可行性研究/],['造价咨询',/造价咨询|全过程造价|造价/],['工程量清单\/招标控制价',/工程量清单|招标控制价|最高投标限价/],['EPC',/EPC|设计施工总承包|工程总承包/],['监理',/监理/],['拆除',/拆除|拆迁清运/],['前期物业',/前期物业|物业管理服务/],['招标代理',/招标代理/],['规划',/规划/],['设计',/设计|设计方案|施工图/],['施工',/施工/],['实施方案',/实施方案/],['咨询',/咨询/],['前期策划',/前期服务|前期策划/]
  ];
  const out=[];
  rules.forEach(([name,re])=>{if(re.test(t)) out.push(name.replace('工程量清单\\/招标控制价','工程量清单/招标控制价'))});
  return [...new Set(out.length?out:['咨询'])];
}
function deriveStage(item,services){
  if(item.project_stage) return item.project_stage;
  const s=new Set(services);
  if(item.status==='awarded') return '结果阶段';
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
  return {...item,_kind:kind,project_type:deriveProjectType(item),service_type:services,project_stage:deriveStage(item,services),province:item.province||'海南省',city:deriveCity(item),district_county:deriveDistrict(item),verification_status:item.verification_status||(item.relevance==='expanded'?'expanded':(item.source_level==='official'||item.source_level==='official_index'?'verified':'pending_official_backfill'))};
}
function normalizedData(data){
  return {
    active:(data.items||[]).map(x=>normalizeItem(x,'active')),
    events:(data.recent_events||[]).map(x=>normalizeItem(x,'event')),
    expanded:(data.expanded_candidates||[]).map(x=>normalizeItem(x,'expanded'))
  };
}
function allRecords(data){const n=normalizedData(data);return [...n.active,...n.events,...n.expanded]}
function allTags(data){return [...new Set(allRecords(data).flatMap(x=>x.tags||[]))].sort()}
function allRegions(data){return [...new Set(allRecords(data).map(x=>x.city).filter(Boolean))].sort()}
function allProjectTypes(data){return [...new Set(allRecords(data).map(x=>x.project_type).filter(Boolean))].sort()}
function allServiceTypes(data){return [...new Set(allRecords(data).flatMap(x=>x.service_type||[]))].sort()}
function searchable(item){return [item.title,item.project_id,item.region,item.city,item.district_county,item.purchaser,item.winner,item.notice_type,item.procurement_method,item.summary,item.project_type,item.project_stage,...(item.service_type||[]),...(item.tags||[])].filter(Boolean).join(' ').toLowerCase()}
function currentFilters(){return {q:$('#searchInput').value.trim().toLowerCase(),region:$('#regionFilter').value,projectType:$('#projectTypeFilter').value,serviceType:$('#serviceTypeFilter').value,tag:$('#tagFilter').value}}
function matches(item,f){
  if(f.q&&!searchable(item).includes(f.q)) return false;
  if(f.region&&item.city!==f.region) return false;
  if(f.projectType&&item.project_type!==f.projectType) return false;
  if(f.serviceType&&!(item.service_type||[]).includes(f.serviceType)) return false;
  if(f.tag&&!(item.tags||[]).includes(f.tag)) return false;
  return true;
}
function statMatches(item,data){
  if(!activeStatFilter) return true;
  if(activeStatFilter==='new') return item._kind!=='expanded' && (item.is_new_today===true || item.publish_date===data.date);
  if(activeStatFilter==='active') return item._kind==='active' && item.status==='active';
  if(activeStatFilter==='deadline') return item._kind==='active' && item.deadline && new Date(item.deadline).getTime()>=Date.now();
  if(activeStatFilter==='expanded') return item._kind==='expanded';
  return true;
}
function amountText(item){
  if(item.award_yuan) return `${money(item.award_yuan)}（成交）`;
  if(item.control_price_yuan) return `${money(item.control_price_yuan)}（控制价）`;
  if(item.budget_yuan) return `${money(item.budget_yuan)}（采购预算）`;
  if(item.project_investment_yuan) return `${money(item.project_investment_yuan)}（项目投资）`;
  return '未披露';
}
function renderProject(item){
  const auxTags=(item.tags||[]).filter(t=>t!==item.project_type&&!(item.service_type||[]).includes(t)).slice(0,6).map(t=>`<span class="tag tag-aux">${esc(t)}</span>`).join('');
  const serviceTags=(item.service_type||[]).map(t=>`<span class="tag tag-service">${esc(t)}</span>`).join('');
  const cls=item._kind==='expanded'?'expanded':item.status==='awarded'?'awarded':'';
  const statusCls=item._kind==='expanded'?'status-expanded':item.status==='awarded'?'status-awarded':'status-active';
  const deadline=item.deadline?`${fmtDate(item.deadline)}${daysLeft(item.deadline)?` · ${daysLeft(item.deadline)}`:''}`:'—';
  return `<article class="project ${cls}">
    <div class="project-top">
      <div class="project-title">${esc(item.title||'未命名项目')}</div>
      <div class="tags"><span class="tag ${sourceClass(item)}">${sourceText(item)}</span><span class="tag ${statusCls}">${item._kind==='expanded'?'扩展候选':statusText(item)}</span><span class="tag tag-project">${esc(item.project_type)}</span>${serviceTags}${auxTags}</div>
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
      <div class="fact"><dt>${item.status==='awarded'?'中标单位':'截止时间'}</dt><dd>${item.status==='awarded'?esc(item.winner||'待补充'):esc(deadline)}</dd></div>
      <div class="fact"><dt>核验状态</dt><dd>${item.verification_status==='verified'?'已核验':item.verification_status==='expanded'?'扩展候选':'待补官方原文'}</dd></div>
    </dl>
    <div class="project-actions">${item.source_url?`<a class="source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener">查看原文 ↗</a>`:''}</div>
    ${item.verification?`<div class="verify">待核验：${esc(item.verification)}</div>`:''}
  </article>`;
}
function renderStats(data){
  const s=data.summary||{};
  const cards=[
    {key:'new',label:'今日新增',value:s.new_today||0,cls:'primary'},
    {key:'active',label:'当前有效',value:s.active_core||0,cls:'good'},
    {key:'deadline',label:'即将截止',value:s.upcoming_deadlines||0,cls:'warn'},
    {key:'expanded',label:'扩展候选',value:s.expanded_candidates||0,cls:''}
  ];
  $('#stats').innerHTML=cards.map(c=>`<button type="button" class="stat ${c.cls} ${activeStatFilter===c.key?'is-selected':''}" data-stat="${c.key}" aria-pressed="${activeStatFilter===c.key}" title="点击筛选，再次点击取消"><b>${c.value}</b><span>${c.label}</span></button>`).join('');
}
function renderSources(data){
  $('#sourceList').innerHTML=(data.sources||[]).map(url=>{let name=url;try{name=new URL(url).hostname}catch{}return `<div class="source"><a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(name)}</a></div>`}).join('')||'<div class="empty">暂无来源记录。</div>';
}
function setOptions(el,baseLabel,values,current){
  el.innerHTML=`<option value="">${baseLabel}</option>`+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(values.includes(current)) el.value=current;
}
function renderFilters(data){
  const r=$('#regionFilter'),p=$('#projectTypeFilter'),s=$('#serviceTypeFilter'),t=$('#tagFilter');
  const rv=r.value,pv=p.value,sv=s.value,tv=t.value;
  setOptions(r,'全部地区',allRegions(data),rv);
  setOptions(p,'全部类型',allProjectTypes(data),pv);
  setOptions(s,'全部服务',allServiceTypes(data),sv);
  setOptions(t,'全部标签',allTags(data),tv);
}
function renderLists(data){
  const f=currentFilters();
  const n=normalizedData(data);
  const active=n.active.filter(x=>matches(x,f)&&statMatches(x,data));
  const events=n.events.filter(x=>matches(x,f)&&statMatches(x,data));
  const expanded=n.expanded.filter(x=>matches(x,f)&&statMatches(x,data));

  $('#activeCount').textContent=active.length; $('#eventCount').textContent=events.length; $('#expandedCount').textContent=expanded.length;
  $('#activeList').innerHTML=active.length?active.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的核心在招项目。</div>';
  $('#eventList').innerHTML=events.length?events.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的近期结果事件。</div>';
  $('#expandedList').innerHTML=expanded.length?expanded.map(renderProject).join(''):'<div class="empty">暂无符合筛选条件的扩展候选。</div>';

  const showOnlyActive=activeStatFilter==='active'||activeStatFilter==='deadline';
  const showOnlyExpanded=activeStatFilter==='expanded';
  $('#activeSection').style.display=showOnlyExpanded?'none':'';
  $('#eventSection').style.display=(showOnlyActive||showOnlyExpanded)?'none':'';
  $('#expandedSection').style.display=showOnlyActive?'none':'';
  if(activeStatFilter==='new'){
    $('#activeSection').style.display=active.length?'':'none';
    $('#eventSection').style.display=events.length?'':'none';
    $('#expandedSection').style.display='none';
  }

  const parts=[];
  const statLabels={new:'今日新增',active:'当前有效',deadline:'即将截止',expanded:'扩展候选'};
  if(activeStatFilter) parts.push(`快速筛选“${statLabels[activeStatFilter]}”`);
  if(f.q)parts.push(`关键词“${esc(f.q)}”`);
  if(f.region)parts.push(`地区“${esc(f.region)}”`);
  if(f.projectType)parts.push(`项目类型“${esc(f.projectType)}”`);
  if(f.serviceType)parts.push(`服务类型“${esc(f.serviceType)}”`);
  if(f.tag)parts.push(`标签“${esc(f.tag)}”`);
  const total=active.length+events.length+expanded.length;
  $('#filterHint').innerHTML=parts.length?`当前筛选：${parts.join(' · ')}，共显示 <strong>${total}</strong> 条。再次点击已选统计卡可取消快速筛选。`:'';
}
function render(data){
  latestData=data;
  $('#meta').textContent=`巡检日期：${data.date||'未知'} ｜ 数据生成：${fmtDate(data.generated_at||'')} ｜ 海南省城市更新相关公开招投标信息`;
  const s=data.summary||{};
  $('#summary').innerHTML=`<strong>${s.note||'暂无巡检摘要。'}</strong><br>核心项目与扩展候选分开统计；项目类型、服务类型和项目阶段按统一字段规范进行查询。`;
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
['searchInput','regionFilter','projectTypeFilter','serviceTypeFilter','tagFilter'].forEach(id=>$('#'+id)?.addEventListener(id==='searchInput'?'input':'change',()=>latestData&&renderLists(latestData)));
$('#stats')?.addEventListener('click',e=>{
  const card=e.target.closest('.stat[data-stat]');
  if(!card||!latestData) return;
  activeStatFilter=activeStatFilter===card.dataset.stat?null:card.dataset.stat;
  renderStats(latestData); renderLists(latestData);
});
$('#clearBtn')?.addEventListener('click',()=>{
  $('#searchInput').value='';$('#regionFilter').value='';$('#projectTypeFilter').value='';$('#serviceTypeFilter').value='';$('#tagFilter').value='';activeStatFilter=null;
  if(latestData){renderStats(latestData);renderLists(latestData)}
});
$('#refreshBtn')?.addEventListener('click',load);
load();
