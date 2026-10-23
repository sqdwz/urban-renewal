# Urban Renewal · 海南省招投标巡检

海南省19市县城市更新及关联建设项目专业服务公告的每日发现、项目链追踪和历史补录。

- 在线页面：https://sqdwz.github.io/urban-renewal/
- 配置真源：`config/search-rules.json`（v6）、`config/sources.json`、`config/coverage-regions.json`
- 页面：当前巡检、近三年历史库、关联观察三类入口
- 数据状态以 `data/index.json` 和相应日报内容为准；source_error 与未覆盖来源不能算“0结果”

## v6 为什么升级

v5容易漏掉项目名称没有“城市更新/老旧小区”等字眼的公告，例如“澄迈开元广场项目可行性研究报告编制服务单位比选”。v6增加**双轨发现**，但不降低城市更新核心入库门槛：

1. **A轨·核心发现**：城市更新、城中村、老旧小区、棚改、安置区等主题×全部服务/公告类型×项目链。
2. **B轨·泛建设发现**：独立逐市县搜索可研、比选、流标、再比选、测绘、评估、设计、监理、工程检测、招标代理和合同等，不要求命中核心主题词。优先检查本地政府、城投国企和业主公告栏目。
3. **证据分类**：官方或权威证据确认关联的进入核心；广场/商住综合体等尚未确认更新关联的进入 `related_development_watch`；仅命中通用服务词的进入 `expanded_candidates`。A/B官方为 `verified`，C专业权威为 `verified_authoritative`，D聚合转载仅 `pending_official_backfill`。
4. **项目链和历史回溯**：保留招标、流标、更正、二次、候选、结果、合同为独立事件，按项目ID/业主/地块号关联；每日7天重叠窗口与30天抽查，每周90天、每月三年历史回溯。
5. **不丢失失败任务**：source_error/source_unavailable以及未完成官方反查需保留队列，并记录实际分页完成状态。19市县每个必查来源组没有完整核验前不得标记 complete 或 zero_verified。

必查来源与来源等级均以 `config/sources.json` 为准，当前的19市县清单以 `config/coverage-regions.json` 为准。

## 数据结构

| 路径 | 用途 |
| --- | --- |
| `data/daily/YYYY-MM-DD.json` | 单日日报、来源审计与19市县覆盖记录 |
| `data/latest.json` | 网页读取的最新日报完整内容 |
| `data/index.json` | 最新日报、历史库入口 |
| `data/history/index.json` | 历史补录数据集索引 |
| `data/history/*.json` | 各批次的已核验事件与D级待回填线索 |
| `data/watchlist/projects.json` | **非核心**关联开发项目及其独立公告事件 |
| `data/queues/official-backfill.json` | D级公告官方原文回溯任务 |
| `data/queues/source-retry.json` | 必查来源异常重试任务 |

`data/watchlist/projects.json` 已登记澄迈开元广场的2026-09-18可研比选和2026-09-30流标两条D级转载事件；**目前不能把它们列为已官方核验的城市更新核心项目**。4亿元为转载中的预计建设总投资，不是可研咨询服务采购金额。

## 自动化与质量检查

当前研究执行者是 ChatGPT 的每日定时任务。仓库以前仅有 GitHub Pages 部署工作流，不存在完整的独立网页采集器；v6新增辅助生成计划与质量门禁，**不冒充已完成的网页采集**：

```bash
python scripts/build_discovery_plan.py --date 2026-10-23 --output /tmp/discovery-plan.json
python -m unittest discover -s tests -v
python scripts/audit_quality.py --strict --require-fresh
node --check app.js
```

`.github/workflows/discovery-quality.yml` 在推送及每天北京时间13:30执行回归测试、计划生成、数据日期/完整性质量检查并保留报告工件；这是**监测与提醒**，不会自动把待执行的查询计划算作来源已巡检。真正的检索结果必须附公告URL、查询窗口、分页与审计证据，并由每日定时任务入库。

`.github/workflows/pages.yml` 负责部署网页，不承担项目采集。网页兼容新版日报 `new_items/upcoming_deadlines/backfilled_events`，并独立读取关联观察库。

## 写入原则

- 保留既有有效历史记录，D级事件不能被无根据地提升为verified。
- 日报、latest、index和历史索引需校验日期、去重、数量和来源状态；优先一次提交，写入后从main回读。
- 任一来源没有完成真实检索，必须用partial标记；GitHub同步中断也应如实标记partial_write/sync_failed。
- 发现更多候选但尚无可靠官方证据时，保存观察/回溯任务，不会把它们误计入核心统计。
