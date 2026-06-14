
  P0：准确率评估的方法论缺陷（直接影响产品可信度）

  这是最核心的问题。准确率数字是整个产品的招牌（dashboard widget、7d/30d 滚动准确率），但当前算法有几处会让数字失真：

  1. 只看终点价、忽略路径 — accuracy_tracker._score_one 和 backtester 都只取窗口结束时刻的单点价格判断对错。一个 buy 建议中途先跌穿止损 -20% 再涨回来，会被记为"correct"，而真实交易早已被止损出场。target_hit/stop_hit
  也只在终点价上判断，不是窗口内的 high/low 触达。建议：用窗口内 1h K 线的 high/low 做路径评估，先触发 stop 即判负。 数据已经在库里，只是没用。

  2. 没有手续费/最小波动阈值 — change_pct > 0 就算对，意味着 +0.01% 也是"correct"。扣掉 taker 费 + 滑点（约 0.1%），这类预测实际是亏的。建议设阈值（如 ±0.3%），区间内记为 "flat/无效预测" 而不是对或错。

  3. 没有基准对照 — 牛市里 buy 准确率 60% 毫无信息量。建议在 _update_rolling_accuracy 里同时算一个 baseline（同期"无脑买入 BTC"的方向命中率），展示超额命中率而非绝对值。

  4. AI 给的 entry_price 被无视 — 评分用的是报告生成时刻的市价，而非 AI 推荐的入场价。如果 AI 说"回调到 3750 再买"，按市价评估就冤枉或美化了它。

  5. sell 语义不一致 — accuracy_tracker 把 sell 当做空评估（return = -change_pct），simulate_portfolio 里 sell 只是平多仓。两套口径的"准确率"和"回测收益"对不上，用户会困惑。

  6. 没有按 confidence 分层的校准分析 — schema 里采集了 high/medium/low confidence，但从未验证"high confidence 是否真的更准"。这是量化产品最有说服力的图表（calibration curve），数据齐全，只差聚合逻辑。

  ────────────────────────────────────────

  P1：反馈闭环没有闭合（产品核心价值未兑现）

  7. 权重写死，"tunable based on backtesting" 是空头支票 — signal_aggregator.DEFAULT_WEIGHTS 注释说可按回测调优，但没有任何代码消费 accuracy
  数据去调整权重。这是整个系统最自然的进化方向：每周用各组件（technical/ai/fear_greed/futures）的独立命中率重新分配权重。

  8. 复合信号本身没有历史、没有评估 — generate_composite_signal 的结果不落库，意味着无法回答"复合信号比纯 AI 信号准多少"这个产品核心问题。建议把每次信号快照持久化，纳入与 AI 推荐相同的评估管道。

  9. AI 情绪分没有时效衰减 — signal_aggregator 取最近一份报告，哪怕是 3 天前的，也按满权重计入。建议按报告年龄做线性/指数衰减，超过分析周期（4h）×2 后降权。

  10. 资金费率阈值疑似校准错误 — _futures_score 把 funding > 0.0001（0.01%）判为"多头杠杆过度"，但 0.01%/8h 正是 Binance 的基准费率，正常市况就会触发看空信号。建议改成相对历史分位数（如 30 天 P80）而非绝对阈值。

  ────────────────────────────────────────

  P2：回测引擎的真实性

  11. simulate_portfolio 的止损/止盈只在报告时间点检查（每 4h 一次），两次报告之间的爆仓不会被捕捉；且用固定 stop_loss_pct 参数，无视 AI 报告里给出的 stop_loss 价位——等于没有回测"按 AI 建议交易"这个策略本身。
  12. 无手续费、无滑点、无 Sharpe/Sortino/单币种归因，max_drawdown 用报告时间点采样会低估。
  13. ±2h 价格容差 vs 1h 评估窗口 — EVAL_WINDOWS 含 1h，而 price_cache 容差是 ±2h，1h 窗口的准确率数字基本是噪声，建议直接去掉 1h 窗口或对短窗口用 1m 数据。

  ────────────────────────────────────────

  P3：工程细节

  • 14. accuracy_tracker.score_matured_recommendations 每次全表扫描所有过期报告，_already_scored 在 Python 里过滤。应在 SQL 加 accuracy IS NULL 条件，否则随报告积累线性变慢。
  • 15. 新闻评分中 primary_asset 无法映射到已收集 K 线的币种时，行会被永远反复扫描而无 "unscorable" 终态。
  • 16. schemas.AnalysisOutput._coerce_sentiment 把无法解析的值静默归 0，而 0 在下游是"中性信号"——模型输出异常被掩盖成了一个有语义的值，建议失败时直接拒绝该报告。
  • 17. generate_all_signals 硬编码 4 个交易对，应读 CEX_DEFAULT_SYMBOLS / AI_ANALYSIS_SYMBOLS 配置。
  • 18. 分析每 4h 无条件运行，无论行情是否变化。可加"快照差异门控"（价格波动 < X% 且无新信号时跳过），直接省 AI 成本。
