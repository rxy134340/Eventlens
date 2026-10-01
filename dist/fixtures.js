export const demoEvent = '星河材料（构造样例）发布前三季度业绩预告修正公告，利润区间下修。请梳理可核查事实、可能影响与后续观察点。';

export const demoEvidence = [
  {
    id: 'E1', kind: 'announcement', title: '前三季度业绩预告修正公告',
    source: '星河材料（构造样例）', sourceUrl: 'demo://announcement/E1',
    publishedAt: '2026-09-29 18:00', asOf: '2026 年前三季度', unit: '亿元',
    basis: '归母净利润预告区间；未经审计',
    excerpt: '预计前三季度归母净利润 3.2–3.8 亿元，前次预告 5.0–5.8 亿元。修正原因需以正式公告说明为准。',
    dataStatus: 'synthetic'
  },
  {
    id: 'E2', kind: 'financial', title: '修正前后预告区间字段',
    source: '构造样例计算字段', sourceUrl: 'demo://financial/E2',
    publishedAt: '2026-09-29 18:00', asOf: '2026 年前三季度', unit: '亿元',
    basis: '归母净利润；预告区间；非审计数',
    excerpt: '修正前 5.0–5.8；修正后 3.2–3.8。两个区间均为构造样例。',
    dataStatus: 'synthetic'
  },
  {
    id: 'E3', kind: 'market', title: '事件后交易日行情快照',
    source: '构造行情样例', sourceUrl: 'demo://market/E3',
    publishedAt: '2026-09-30 15:00', asOf: '2026-09-30 收盘', unit: '%',
    basis: '未复权收盘价相对前收盘价；行业指数为构造对照',
    excerpt: '样例股当日跌幅 4.6%；样例行业指数跌幅 0.8%。无法仅凭同日变化证明事件因果。',
    dataStatus: 'synthetic'
  }
];

