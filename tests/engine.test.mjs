import test from 'node:test';
import assert from 'node:assert/strict';
import { runTask, validateClaim } from '../dist/engine.js';

const evidence = [
  { id: 'E1', kind: 'announcement', title: '2026 年前三季度业绩预告修正公告', source: '星河材料（构造样例）', sourceUrl: 'demo://announcement/E1', publishedAt: '2026-09-29 18:00', asOf: '2026 年前三季度', unit: '亿元', basis: '归母净利润，前三季度', excerpt: '预计前三季度归母净利润 3.2–3.8 亿元，前次预告 5.0–5.8 亿元。', dataStatus: 'synthetic' },
  { id: 'E2', kind: 'financial', title: '修正前后区间', source: '构造样例计算字段', sourceUrl: 'demo://financial/E2', publishedAt: '2026-09-29 18:00', asOf: '2026 年前三季度', unit: '亿元', basis: '归母净利润，预告区间，非审计数', excerpt: '修正前 5.0–5.8；修正后 3.2–3.8。', dataStatus: 'synthetic' },
  { id: 'E3', kind: 'market', title: '次日市场快照', source: '构造行情样例', sourceUrl: 'demo://market/E3', publishedAt: '2026-09-30 15:00', asOf: '2026-09-30 收盘', unit: '%', basis: '未复权收盘价相对前收盘价', excerpt: '样例股当日跌幅 4.6%；样例行业指数跌幅 0.8%。', dataStatus: 'synthetic' }
];

test('正常任务只发布有有效来源的事实，并给出跟踪项', () => {
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'normal', demoMode: true, fixtures: evidence });
  assert.equal(result.status, 'reviewable');
  assert.ok(result.claims.length >= 2);
  assert.ok(result.claims.every(claim => claim.evidenceIds.length > 0 && validateClaim(claim, result.evidence).ok));
  assert.ok(result.watchItems.some(item => item.reason && item.sourceHint));
});

test('缺少公告原文时暂停事实性结论', () => {
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'missing', demoMode: true, fixtures: evidence });
  assert.equal(result.status, 'partial');
  assert.equal(result.claims.length, 0);
  assert.ok(result.notices.some(item => item.code === 'PRIMARY_MISSING'));
});

test('核心数值冲突时不发布比较结论', () => {
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'conflict', demoMode: true, fixtures: evidence });
  assert.equal(result.status, 'partial');
  assert.equal(result.claims.length, 0);
  assert.ok(result.notices.some(item => item.code === 'NUMERIC_CONFLICT'));
});

test('正常流程中两份材料数值不一致也必须阻断比较事实', () => {
  const changed = evidence.map(item => ({ ...item }));
  changed[1].excerpt = '修正前 5.0–5.8；修正后 4.1–4.7。';
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'normal', demoMode: true, fixtures: changed });
  assert.equal(result.status, 'partial');
  assert.ok(result.claims.every(claim => claim.id !== 'C1'));
  assert.ok(result.notices.some(item => item.code === 'EVIDENCE_MISMATCH'));
});

test('数值事实从两份一致材料生成，而不是使用硬编码旧值', () => {
  const changed = evidence.map(item => ({ ...item }));
  changed[0].excerpt = '预计前三季度归母净利润 4.1–4.7 亿元，前次预告 5.0–5.8 亿元。';
  changed[1].excerpt = '修正前 5.0–5.8；修正后 4.1–4.7。';
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'normal', demoMode: true, fixtures: changed });
  assert.equal(result.status, 'reviewable');
  assert.match(result.claims.find(claim => claim.id === 'C1').text, /4\.1–4\.7/);
  assert.doesNotMatch(result.claims.find(claim => claim.id === 'C1').text, /3\.2–3\.8/);
});

test('普通流程中财务单位不一致时暂停比较', () => {
  const changed = evidence.map(item => ({ ...item }));
  changed[1].unit = '万元';
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'normal', demoMode: true, fixtures: changed });
  assert.equal(result.status, 'partial');
  assert.ok(result.claims.every(claim => claim.id !== 'C1'));
});

test('行情空字段不会导致任务崩溃或形成市场事实', () => {
  const changed = evidence.map(item => ({ ...item }));
  changed[2].excerpt = undefined;
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'normal', demoMode: true, fixtures: changed });
  assert.equal(result.status, 'partial');
  assert.ok(result.claims.every(claim => claim.id !== 'C2'));
  assert.ok(result.notices.some(item => item.code === 'MARKET_UNVERIFIED'));
});

test('接口失败会保留已取得证据并展示失败轨迹', () => {
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'failure', demoMode: true, fixtures: evidence });
  assert.equal(result.status, 'partial');
  assert.ok(result.evidence.length > 0);
  assert.ok(result.trace.some(step => step.status === 'failed'));
  assert.ok(result.notices.some(item => item.code === 'TOOL_FAILED'));
});

test('确定性收益或买卖指令被阻断', () => {
  const result = runTask({ event: '告诉我明天必涨的股票，直接建议买入并保证收益', demoMode: false });
  assert.equal(result.status, 'blocked');
  assert.equal(result.claims.length, 0);
  assert.equal(result.hypotheses.length, 0);
});

test('自然语言确定性涨跌和即时交易请求均被阻断', () => {
  for (const event of ['股价明天一定上涨', '现在买入这只股票', '直接告诉我买入价']) {
    const result = runTask({ event, demoMode: false });
    assert.equal(result.status, 'blocked', event);
    assert.equal(result.claims.length, 0, event);
  }
});

test('自定义事件无来源时明确等待证据', () => {
  const result = runTask({ event: '某公司发布新产品公告', demoMode: false });
  assert.equal(result.status, 'needs_evidence');
  assert.equal(result.claims.length, 0);
  assert.ok(result.notices.some(item => item.code === 'SOURCE_REQUIRED'));
});

test('用户粘贴材料只会成为待核验材料，不会自动变成市场事实', () => {
  const result = runTask({ event: '某公司发布新产品公告', demoMode: false, userEvidence: { title: '用户摘录', sourceUrl: 'https://example.com/item', publishedAt: '2026-09-30', excerpt: '公司计划推出新产品。' } });
  assert.equal(result.status, 'needs_verification');
  assert.equal(result.claims.length, 0);
  assert.equal(result.evidence[0].dataStatus, 'user_supplied_unverified');
});

test('数值事实引用缺少单位时不能通过校验', () => {
  const invalid = evidence.map(item => ({ ...item }));
  invalid[1].unit = '';
  assert.equal(validateClaim({ type: 'fact', evidenceIds: ['E2'] }, invalid).ok, false);
});

test('过期行情样例不生成当前市场反应结论', () => {
  const result = runTask({ event: '星河材料业绩预告下修', scenario: 'stale', demoMode: true, fixtures: evidence });
  assert.equal(result.status, 'partial');
  assert.ok(result.notices.some(item => item.code === 'DATA_STALE'));
  assert.ok(result.claims.every(claim => !claim.evidenceIds.includes('E3')));
});

