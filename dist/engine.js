const requiredEvidenceFields = ['id', 'title', 'source', 'sourceUrl', 'publishedAt', 'asOf', 'unit', 'basis', 'excerpt', 'dataStatus'];

export function validateClaim(claim, evidence) {
  if (claim.type !== 'fact' || !Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0) {
    return { ok: false, reason: '事实必须绑定证据 ID' };
  }
  for (const id of claim.evidenceIds) {
    const item = evidence.find(source => source.id === id);
    if (!item) return { ok: false, reason: `引用 ${id} 不存在` };
    if (requiredEvidenceFields.some(field => !item[field])) return { ok: false, reason: `引用 ${id} 元数据不完整` };
    if (item.dataStatus !== 'synthetic' && item.dataStatus !== 'verified') {
      return { ok: false, reason: `引用 ${id} 未核验` };
    }
  }
  return { ok: true };
}

const notice = (code, title, detail) => ({ code, title, detail });
const step = (id, title, status, detail) => ({ id, title, status, detail });

function base(event) {
  return {
    event,
    status: 'needs_input',
    mode: 'local_orchestration',
    evidence: [],
    claims: [],
    hypotheses: [],
    watchItems: [],
    trace: [],
    notices: [],
    plan: ['识别事件', '采集原始证据', '校验时点与口径', '整理事实和假设', '确认跟踪项']
  };
}

function hasUnsafeRequest(text) {
  return /(必涨|稳赚|保证收益|保本|确定性涨跌|明天涨停|买哪只股票|(?:一定|必然|肯定).{0,4}(?:上涨|下跌|涨停|跌停|涨|跌)|(?:现在|立即|马上|立刻|直接).{0,10}(?:买入价|卖出价|买入|卖出|加仓|减仓|建仓|清仓|买点|卖点))/i.test(text);
}

function readRange(text, label) {
  const match = String(text).match(new RegExp(`${label}\\s*(\\d+(?:\\.\\d+)?)\\s*[–—-]\\s*(\\d+(?:\\.\\d+)?)`));
  if (!match || Number(match[1]) > Number(match[2])) return null;
  return { low: match[1], high: match[2] };
}

function sameRange(left, right) {
  return left && right && Number(left.low) === Number(right.low) && Number(left.high) === Number(right.high);
}

function consistentForecast(announcement, financial) {
  if (!announcement || !financial || announcement.unit !== financial.unit || announcement.asOf !== financial.asOf) return null;
  if (!/归母净利润/.test(announcement.basis) || !/归母净利润/.test(financial.basis)) return null;
  const newAnnouncement = readRange(announcement.excerpt, '归母净利润');
  const oldAnnouncement = readRange(announcement.excerpt, '前次预告');
  const oldFinancial = readRange(financial.excerpt, '修正前');
  const newFinancial = readRange(financial.excerpt, '修正后');
  if (!sameRange(newAnnouncement, newFinancial) || !sameRange(oldAnnouncement, oldFinancial)) return null;
  return { before: oldAnnouncement, after: newAnnouncement };
}

function normalClaims(evidence) {
  const announcement = evidence.find(item => item.kind === 'announcement');
  const financial = evidence.find(item => item.kind === 'financial');
  const market = evidence.find(item => item.kind === 'market');
  const proposed = [];
  const forecast = consistentForecast(announcement, financial);
  if (forecast) {
    proposed.push({ id: 'C1', type: 'fact', title: '预告区间下修', text: `构造样例中，前三季度归母净利润预告区间从 ${forecast.before.low}–${forecast.before.high} ${announcement.unit}调整为 ${forecast.after.low}–${forecast.after.high} ${announcement.unit}。`, evidenceIds: [announcement.id, financial.id], qualifier: '构造数据 · 预告数非审计数' });
  }
  const stockMove = market?.excerpt?.match(/样例股当日跌幅\s*(\d+(?:\.\d+)?)%/);
  const sectorMove = market?.excerpt?.match(/样例行业指数跌幅\s*(\d+(?:\.\d+)?)%/);
  if (market?.unit === '%' && stockMove && sectorMove) {
    proposed.push({ id: 'C2', type: 'fact', title: '样例市场反应', text: `构造行情显示，事件后下一交易日样例股跌幅 ${stockMove[1]}%，样例行业指数跌幅 ${sectorMove[1]}%；这只是同日观察，不能证明因果。`, evidenceIds: [market.id], qualifier: '构造行情 · 未复权收盘口径' });
  }
  return proposed.filter(claim => validateClaim(claim, evidence).ok);
}

export function runTask({ event = '', scenario = 'normal', demoMode = false, fixtures = [], userEvidence = null } = {}) {
  const cleanedEvent = String(event).trim();
  const result = base(cleanedEvent);
  if (!cleanedEvent) {
    result.notices.push(notice('INPUT_REQUIRED', '请先描述事件', '事件文本是任务规划的起点。'));
    return result;
  }
  result.trace.push(step('classify', '识别任务', 'done', '已提取事件文本与研究目标。'));
  if (hasUnsafeRequest(cleanedEvent)) {
    result.status = 'blocked';
    result.notices.push(notice('COMPLIANCE_BLOCK', '请求超出研究辅助范围', '可改为分析已公开事实、情景条件及风险因素；不提供确定性预测或直接交易指令。'));
    result.trace.push(step('guardrail', '合规边界', 'blocked', '已停止生成交易动作。'));
    return result;
  }

  if (!demoMode) {
    result.trace.push(step('source', '收集材料', 'waiting', '未连接实时金融接口；等待用户提供可核验原文。'));
    if (userEvidence?.excerpt?.trim()) {
      result.evidence = [{
        id: 'U1', kind: 'user_input', title: userEvidence.title?.trim() || '用户粘贴材料',
        source: '用户提供，未独立核验', sourceUrl: userEvidence.sourceUrl?.trim() || '未提供',
        publishedAt: userEvidence.publishedAt?.trim() || '未提供', asOf: userEvidence.publishedAt?.trim() || '未提供',
        unit: '原文', basis: '用户摘录；来源真实性未验证', excerpt: userEvidence.excerpt.trim(),
        dataStatus: 'user_supplied_unverified'
      }];
      result.status = 'needs_verification';
      result.notices.push(notice('SOURCE_UNVERIFIED', '材料已收录，尚不能作为市场事实', '请核对原始公告或授权数据源，再生成事实性结论。'));
    } else {
      result.status = 'needs_evidence';
      result.notices.push(notice('SOURCE_REQUIRED', '缺少原始证据', '输入公告链接及原文，或选择构造样例体验完整链路。'));
    }
    result.watchItems = [{ id: 'W0', title: '核对原始公告或授权数据源', reason: '当前事件没有已核验的一手证据', sourceHint: '交易所公告、公司公告或经授权金融数据源', dueHint: '生成结论前' }];
    return result;
  }

  result.evidence = fixtures.map(item => ({ ...item }));
  result.trace.push(step('announcement', '检索事件原文', 'done', '读取构造公告样例；未发起外部 API 调用。'));
  result.trace.push(step('financial', '校验财务口径', 'done', '核对期间、单位及预告口径。'));
  result.trace.push(step('market', '读取行情快照', 'done', '读取构造行情样例；未发起外部 API 调用。'));

  if (scenario === 'missing') {
    result.evidence = result.evidence.filter(item => item.kind !== 'announcement');
    result.status = 'partial';
    result.claims = [];
    result.notices.push(notice('PRIMARY_MISSING', '一手公告缺失', '没有原始公告文本，系统暂停事实性总结；现有辅助材料仅供核查。'));
    result.trace[1] = step('announcement', '检索事件原文', 'missing', '未获得原文；事实发布门禁关闭。');
  } else if (scenario === 'conflict') {
    result.evidence.push({ ...result.evidence.find(item => item.kind === 'financial'), id: 'E4', title: '相互冲突的构造财务片段', excerpt: '修正后区间 4.1–4.7 亿元，与 E1/E2 不一致。', source: '构造冲突样例', sourceUrl: 'demo://financial/E4' });
    result.status = 'partial';
    result.claims = [];
    result.notices.push(notice('NUMERIC_CONFLICT', '关键数值冲突', '两份材料对修正后区间的描述不一致，暂停综合数值结论，等待核对披露原文。'));
    result.trace[2] = step('financial', '校验财务口径', 'conflict', '发现 E1/E2 与 E4 数值不一致。');
  } else if (scenario === 'failure') {
    result.evidence = result.evidence.filter(item => item.kind !== 'market');
    result.status = 'partial';
    result.notices.push(notice('TOOL_FAILED', '行情工具调用失败', '保留公告与财务证据；不生成市场反应结论。可重试此阶段。'));
    result.trace[3] = step('market', '读取行情快照', 'failed', '模拟接口超时；未伪造行情结果。');
    result.claims = normalClaims(result.evidence);
  } else if (scenario === 'stale') {
    result.evidence = result.evidence.map(item => item.kind === 'market' ? { ...item, publishedAt: '2026-07-01 15:00', asOf: '2026-07-01 收盘', dataStatus: 'synthetic_stale' } : item);
    result.status = 'partial';
    result.notices.push(notice('DATA_STALE', '行情时点已过期', '行情样例被改为历史快照；不生成当前市场反应结论，需更新同口径交易日数据。'));
    result.trace[3] = step('market', '读取行情快照', 'stale', '取得历史快照，未通过时效门禁。');
    result.claims = normalClaims(result.evidence);
  } else {
    result.status = 'reviewable';
    result.claims = normalClaims(result.evidence);
  }

  if (!['missing', 'conflict'].includes(scenario) && !result.claims.some(claim => claim.id === 'C1')) {
    result.status = 'partial';
    result.notices.push(notice('EVIDENCE_MISMATCH', '公告与财务字段未通过一致性校验', '期间、单位、指标或修正前后区间不一致，暂停预告比较事实。'));
    result.trace[2] = step('financial', '校验财务口径', 'conflict', '公告与财务字段无法形成同口径比较。');
  }
  if (scenario === 'normal' && !result.claims.some(claim => claim.id === 'C2')) {
    result.status = 'partial';
    result.notices.push(notice('MARKET_UNVERIFIED', '行情字段未通过校验', '缺少可解析且有效的同日行情字段，暂停市场反应事实。'));
    result.trace[3] = step('market', '读取行情快照', 'missing', '行情字段不完整，未形成市场反应结论。');
  }

  result.hypotheses = result.status === 'reviewable' || scenario === 'failure' ? [
    { id: 'H1', title: '盈利压力可能涉及订单节奏或成本', mechanism: '若公告所述下修来自订单递延或成本抬升，后续季度毛利率与订单交付可提供验证。当前构造材料未给出原因，不能认定具体驱动。', supportingEvidenceIds: result.claims.length ? ['E1'] : [], falsifier: '后续正式财报显示下修主要来自一次性会计项目，且主营经营指标稳定。', certainty: '待验证推断' },
    { id: 'H2', title: '市场反应需与行业因素拆分', mechanism: '同日价格变化可能同时受行业、市场或公司特有信息影响。仅凭一日涨跌不能确定事件归因。', supportingEvidenceIds: result.evidence.some(item => item.id === 'E3') ? ['E3'] : [], falsifier: '扩展窗口及同业对照后，差异并不显著。', certainty: '待验证推断' }
  ] : [];
  result.watchItems = [
    { id: 'W1', title: '核对正式季报的利润与毛利率', reason: '验证预告与最终披露是否一致', sourceHint: '公司正式季报/交易所公告', dueHint: '正式季报披露后' },
    { id: 'W2', title: '对照同业与行业指数', reason: '拆分公司事件和行业共振', sourceHint: '同业财报、行业指数及行情', dueHint: '获得同口径数据后' },
    { id: 'W3', title: '寻找管理层对修正原因的原文解释', reason: '目前缺乏能够支持具体经营归因的一手说明', sourceHint: '公告原文、业绩说明会纪要', dueHint: '下一次公开披露时' }
  ];
  result.trace.push(step('quality', '发布前校验', result.status === 'reviewable' ? 'done' : 'partial', result.status === 'reviewable' ? '已完成引用、时点与风险边界检查。' : '任务以部分结果结束，缺口已显性展示。'));
  return result;
}

