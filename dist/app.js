import { runTask, validateClaim } from './engine.js';
import { demoEvent, demoEvidence } from './fixtures.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statusNames = { reviewable: '可审阅', partial: '部分完成', blocked: '请求受限', needs_evidence: '等待证据', needs_verification: '待核验', needs_input: '待输入' };
const kindNames = { announcement: '公告原文', financial: '财务字段', market: '行情快照', user_input: '用户材料' };
const storageKey = 'eventlens.watch.v1';

const state = { demoMode: true, scenario: 'normal', activeTab: 'analysis', result: null, confirmed: readSaved() };

function readSaved() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
}
function saveConfirmed() {
  try { localStorage.setItem(storageKey, JSON.stringify(state.confirmed)); } catch { /* Private browsing: current session still works. */ }
}
function taskKey() { return state.demoMode ? 'demo-performance-revision' : `custom:${state.result?.event || ''}`; }
function currentConfirmed() { return new Set(state.confirmed[taskKey()] || []); }

function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab').forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
  ['analysis', 'evidence', 'followup'].forEach(name => { $(`#${name}-view`).hidden = name !== tab; });
}

function setMode(demoMode) {
  state.demoMode = demoMode;
  $('#mode-chip').textContent = demoMode ? '构造样例' : '自定义事件';
  $('#source-fields').hidden = demoMode;
  $$('.scenario').forEach(button => button.disabled = !demoMode);
}

function readUserEvidence() {
  return {
    title: $('#source-title').value,
    sourceUrl: $('#source-url').value,
    publishedAt: $('#source-date').value,
    excerpt: $('#source-excerpt').value
  };
}

function run() {
  const result = runTask({
    event: $('#event-input').value,
    scenario: state.scenario,
    demoMode: state.demoMode,
    fixtures: demoEvidence,
    userEvidence: state.demoMode ? null : readUserEvidence()
  });
  state.result = result;
  render();
}

function citeButtons(ids) {
  return ids.map(id => `<button type="button" class="cite-button" data-cite="${esc(id)}" aria-label="查看证据 ${esc(id)}">[${esc(id)}] 查看原字段</button>`).join('');
}

function renderBanner(result) {
  const status = result.status;
  const message = {
    reviewable: ['证据链已整理，等待你审阅', '样例事实有字段来源；经营原因仍属待验证假设。'],
    partial: ['任务部分完成，关键缺口已标出', '现有材料与失败原因均保留。请核查缺口后再形成结论。'],
    blocked: ['请求触及合规边界', '可改为研究公开事实、情景条件与风险因素。'],
    needs_evidence: ['需要一手材料才能继续', '自定义事件尚无可核验来源，系统不会自动编造结论。'],
    needs_verification: ['材料已收录，等待核验', '用户摘录只作线索；请与公告原文或授权数据源核对。'],
    needs_input: ['请先输入事件', '描述研究对象和事件后，再运行任务。']
  }[status];
  const css = status === 'blocked' ? 'blocked' : status === 'reviewable' ? '' : 'partial';
  $('#result-banner').className = `result-banner ${css}`;
  $('#result-banner').innerHTML = `<div><div class="banner-kicker">${state.demoMode ? '构造数据演示 / ' : '自定义研究 / '} ${esc(statusNames[status])}</div><strong>${esc(message[0])}</strong><p>${esc(message[1])}</p></div><span class="banner-state">${esc(statusNames[status])}</span>`;
}

function renderMetrics(result) {
  const validClaims = result.claims.filter(claim => validateClaim(claim, result.evidence).ok);
  const failures = result.trace.filter(step => ['failed', 'missing', 'conflict', 'stale', 'blocked'].includes(step.status)).length;
  $('#metric-row').innerHTML = [
    ['样例事实卡', String(validClaims.length), '张'],
    ['引用覆盖', result.claims.length ? `${Math.round(validClaims.length / result.claims.length * 100)}%` : '—', '本次'],
    ['显性异常', String(failures), '项']
  ].map(([label, value, unit]) => `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
  $('#evidence-count').textContent = result.evidence.length ? `(${result.evidence.length})` : '';
}

function renderAnalysis(result) {
  let html = '';
  if (result.notices.length) html += result.notices.map(item => `<div class="notice-card ${item.code === 'COMPLIANCE_BLOCK' ? 'blocked' : ''}"><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div>`).join('');
  html += `<div class="section-label"><h3>事实层</h3><span>每一项均可回到原始字段</span></div>`;
  if (result.claims.length) {
    html += result.claims.map(claim => `<article class="fact-card"><div class="fact-head"><strong>${esc(claim.title)}</strong><span class="type-badge">构造事实</span></div><p>${esc(claim.text)}</p><div class="fact-meta">${esc(claim.qualifier)}</div><div style="margin-top:9px">${citeButtons(claim.evidenceIds)}</div></article>`).join('');
    html += `<div class="section-label"><h3>影响链</h3><span>机制假设，不作价格预测</span></div><div class="impact-flow"><div class="impact-node"><span>01 事件</span><strong>样例业绩预告区间下修</strong><small>来源 E1 / E2</small></div><div class="impact-node"><span>02 待验证机制</span><strong>订单、成本或一次性因素待辨别</strong><small>需要正式披露解释</small></div><div class="impact-node"><span>03 观察指标</span><strong>最终利润、毛利率与同业表现</strong><small>等待后续可比数据</small></div></div>`;
  } else {
    html += `<div class="empty-card"><strong>当前没有可发布的事实卡</strong><p>请补齐或核验一手来源。缺口保留在本次任务中。</p></div>`;
  }
  html += `<div class="section-label"><h3>推断层</h3><span>附反证条件</span></div>`;
  html += result.hypotheses.length ? result.hypotheses.map(item => `<article class="hypothesis-card"><div class="hypothesis-head"><strong>${esc(item.title)}</strong><span class="type-badge infer">待验证</span></div><p>${esc(item.mechanism)}</p><div class="hypothesis-meta">反证条件：${esc(item.falsifier)}</div>${item.supportingEvidenceIds.length ? `<div style="margin-top:9px">${citeButtons(item.supportingEvidenceIds)}</div>` : ''}</article>`).join('') : `<div class="empty-card"><p>尚无足够材料生成可解释的影响假设。</p></div>`;
  $('#analysis-view').innerHTML = html;
}

function renderEvidence(result) {
  let html = `<p class="view-intro">点击材料展开原始片段和元数据。<strong>构造样例不对应真实证券或实时市场。</strong> 用户材料标为“未核验”，不可直接用于事实性结论。</p>`;
  if (!result.evidence.length) html += `<div class="empty-card"><strong>暂无证据</strong><p>选择示例任务或提供原始材料后，证据将出现在这里。</p></div>`;
  html += result.evidence.map(item => {
    const safeUrl = (() => { try { const u = new URL(item.sourceUrl); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } })();
    return `<details class="evidence-card" id="evidence-${esc(item.id)}"><summary><div class="evidence-main"><strong>${esc(item.title)}</strong><span>${esc(kindNames[item.kind] || '材料')} · ${esc(item.source)} · ${esc(item.dataStatus === 'synthetic' ? '构造数据' : '用户提供，未核验')}</span></div><span class="source-id">${esc(item.id)}</span></summary><div class="evidence-body"><blockquote>${esc(item.excerpt)}</blockquote><dl class="evidence-fields"><div><dt>来源</dt><dd>${esc(item.source)}</dd></div><div><dt>发布时间</dt><dd>${esc(item.publishedAt)}</dd></div><div><dt>数据时点</dt><dd>${esc(item.asOf)}</dd></div><div><dt>单位</dt><dd>${esc(item.unit || '不适用')}</dd></div><div><dt>统计口径</dt><dd>${esc(item.basis)}</dd></div><div><dt>原始链接 / ID</dt><dd>${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">打开用户提供的链接</a>` : esc(item.sourceUrl)}</dd></div></dl></div></details>`;
  }).join('');
  $('#evidence-view').innerHTML = html;
}

function renderFollowup(result) {
  const confirmed = currentConfirmed();
  let html = `<p class="view-intro">只有经你确认的核查动作会进入本地跟踪清单。浏览器本地保存，不会发出提醒或同步账户。</p><div class="followup-counter"><span>已确认的跟踪项</span><strong>${confirmed.size} / ${result.watchItems.length}</strong></div>`;
  if (!result.watchItems.length) html += `<div class="empty-card"><p>当前无可跟踪事项。</p></div>`;
  html += result.watchItems.map(item => `<article class="watch-card ${confirmed.has(item.id) ? 'confirmed' : ''}"><div class="watch-head"><strong>${esc(item.title)}</strong><span class="type-badge ${confirmed.has(item.id) ? '' : 'infer'}">${confirmed.has(item.id) ? '已确认' : '待确认'}</span></div><p>${esc(item.reason)}</p><div class="watch-meta">核查来源：${esc(item.sourceHint)}<br>时间：${esc(item.dueHint)}</div><button type="button" data-watch="${esc(item.id)}">${confirmed.has(item.id) ? '取消跟踪' : '加入跟踪'}</button></article>`).join('');
  $('#followup-view').innerHTML = html;
}

function renderTrace(result) {
  $('#trace-list').innerHTML = result.trace.map(item => `<li class="${esc(item.status)}"><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></li>`).join('');
  const valid = result.claims.filter(claim => validateClaim(claim, result.evidence).ok).length;
  const quality = [
    ['引用校验', result.claims.length ? `${valid}/${result.claims.length} 通过` : '无事实卡', result.claims.length && valid === result.claims.length],
    ['数据来源', state.demoMode ? '构造样例' : '未核验材料', false],
    ['异常状态', result.notices.length ? `${result.notices.length} 项已展示` : '无异常', true],
    ['人工确认', `${currentConfirmed().size} 项跟踪`, true]
  ];
  $('#quality-list').innerHTML = quality.map(([label, value, good]) => `<div class="quality-item"><span>${esc(label)}</span><strong class="${good ? 'good' : 'warn'}">${esc(value)}</strong></div>`).join('');
}

function render() {
  const result = state.result;
  $('#task-status').textContent = statusNames[result.status];
  $('#task-time').textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  renderBanner(result); renderMetrics(result); renderAnalysis(result); renderEvidence(result); renderFollowup(result); renderTrace(result); switchTab(state.activeTab);
}

function exportMarkdown() {
  const result = state.result;
  if (!result) return;
  const lines = ['# EventLens 研究纪要', '', `事件：${result.event}`, `状态：${statusNames[result.status]}`, `模式：${state.demoMode ? '构造数据演示' : '用户材料待核验'}`, '', '## 事实'];
  lines.push(...(result.claims.length ? result.claims.map(claim => `- ${claim.text} [${claim.evidenceIds.join(', ')}]`) : ['- 尚无可发布事实']));
  lines.push('', '## 推断与反证');
  lines.push(...result.hypotheses.map(item => `- ${item.title}：${item.mechanism} 反证：${item.falsifier}`));
  lines.push('', '## 证据索引');
  lines.push(...result.evidence.map(item => `- [${item.id}] ${item.title}｜${item.source}｜${item.publishedAt}｜${item.asOf}｜${item.unit || '不适用'}｜${item.basis}｜${item.sourceUrl}`));
  lines.push('', '## 缺口和异常');
  lines.push(...(result.notices.length ? result.notices.map(item => `- ${item.title}：${item.detail}`) : ['- 无']));
  lines.push('', '## 已确认跟踪项');
  lines.push(...result.watchItems.filter(item => currentConfirmed().has(item.id)).map(item => `- ${item.title}｜${item.sourceHint}｜${item.dueHint}`));
  lines.push('', '构造样例不代表真实市场信息；本纪要不构成投资建议。');
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'EventLens_研究纪要.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#task-form').addEventListener('submit', event => { event.preventDefault(); run(); });
$('#event-input').addEventListener('input', () => { if (state.demoMode) setMode(false); });
$('#demo-button').addEventListener('click', () => { $('#event-input').value = demoEvent; setMode(true); run(); });
$$('.scenario').forEach(button => button.addEventListener('click', () => {
  state.scenario = button.dataset.scenario;
  $$('.scenario').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  if (state.demoMode) run();
}));
$$('.tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('.result-panel').addEventListener('click', event => {
  const cite = event.target.closest('[data-cite]');
  if (cite) { switchTab('evidence'); const card = document.getElementById(`evidence-${cite.dataset.cite}`); if (card) { card.open = true; card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
  const watch = event.target.closest('[data-watch]');
  if (watch) { const confirmed = currentConfirmed(); confirmed.has(watch.dataset.watch) ? confirmed.delete(watch.dataset.watch) : confirmed.add(watch.dataset.watch); state.confirmed[taskKey()] = [...confirmed]; saveConfirmed(); renderFollowup(state.result); renderTrace(state.result); }
});
$('#export-button').addEventListener('click', exportMarkdown);

$('#event-input').value = demoEvent;
setMode(true);
run();

