// 全站静态金融术语库 —— 面向零基础新手的通俗释义。
// 与「研报划词解释」（app/api/assistant/explain）走 AI 生成不同，这里是人工编写、固定内容，
// 好处是：即时展示（无网络等待）、内容可控（不会跑偏/编造）、即使未配置大模型也能用。
// 个股/回测/观察池/资讯等页面的固定标签，优先查这里；只有查不到时才退化到 AI 解释接口。

export type GlossaryCategory =
  | "估值指标"
  | "技术指标"
  | "回测指标"
  | "信号规则"
  | "资讯与情绪"
  | "基础概念";

export interface GlossaryEntry {
  /** 规范 key，供代码里精确引用 */
  key: string;
  /** 展示名称 */
  term: string;
  category: GlossaryCategory;
  /** 界面上可能出现的其它写法，用于术语表搜索与模糊匹配 */
  aliases?: string[];
  definition: string;
  analogy?: string;
  note?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // ---------------- 估值指标 ----------------
  {
    key: "pe",
    term: "市盈率（PE）",
    category: "估值指标",
    aliases: ["市盈率(动)", "市盈率(TTM)", "市盈率", "PE"],
    definition: "股价除以每股盈利，衡量按当前盈利水平，买入后大约需要多少年能「回本」。",
    analogy: "就像买一间商铺，价格除以它每年能赚的钱，得出的年数。",
    note: "数值越低不代表越便宜，还要结合行业与成长性判断。",
  },
  {
    key: "pb",
    term: "市净率（PB）",
    category: "估值指标",
    aliases: ["市净率", "PB"],
    definition: "股价除以每股净资产，衡量股价相对公司账面资产的溢价程度。",
    analogy: "类似房子的成交价除以它的评估价，比值越高说明溢价越多。",
    note: "银行、地产等重资产行业常用 PB；轻资产公司参考意义较小。",
  },
  {
    key: "market_cap",
    term: "总市值",
    category: "估值指标",
    aliases: ["总市值"],
    definition: "股价乘以总股本，代表公司在股票市场上的整体价值。",
  },
  {
    key: "float_market_cap",
    term: "流通市值",
    category: "估值指标",
    aliases: ["流通市值"],
    definition: "股价乘以可自由买卖的流通股本，剔除了限售、未上市流通的部分。",
  },
  {
    key: "eps",
    term: "每股收益（EPS）",
    category: "估值指标",
    aliases: ["每股收益", "EPS"],
    definition: "公司净利润除以总股本，代表平均每一股能分到的盈利。",
  },
  {
    key: "bvps",
    term: "每股净资产",
    category: "估值指标",
    aliases: ["每股净资产"],
    definition: "公司净资产（总资产减总负债）除以总股本，代表每一股对应的账面价值。",
  },
  {
    key: "turnover_rate",
    term: "换手率",
    category: "估值指标",
    aliases: ["换手率"],
    definition: "当天成交的股数占流通股本的比例，反映交易活跃程度。",
    note: "换手率异常升高，往往意味着有资金在大举买入或卖出。",
  },
  {
    key: "volume_ratio",
    term: "量比",
    category: "估值指标",
    aliases: ["量比"],
    definition: "今日每分钟平均成交量，与过去5天同一时段平均成交量的比值。",
    note: "大于1说明比往常更活跃，小于1说明更清淡。",
  },
  {
    key: "amplitude",
    term: "振幅",
    category: "估值指标",
    aliases: ["振幅"],
    definition: "当天最高价与最低价的差，除以昨日收盘价，反映当天波动的剧烈程度。",
  },
  {
    key: "shares",
    term: "总股本 / 流通股本",
    category: "估值指标",
    aliases: ["总股本", "流通股本"],
    definition: "总股本是公司发行的全部股票数量；流通股本是其中可以自由买卖的部分。",
  },
  {
    key: "week52",
    term: "52周最高 / 最低",
    category: "估值指标",
    aliases: ["52周最高", "52周最低"],
    definition: "过去一年（约52周）里，该股票出现过的最高价和最低价。",
  },

  // ---------------- 技术指标 ----------------
  {
    key: "ma",
    term: "均线（MA）",
    category: "技术指标",
    aliases: ["MA", "MA5", "MA10", "MA20", "MA60", "MA5 / MA20", "均线"],
    definition: "过去 N 天收盘价的平均值连成的曲线，数字越小越贴近近期价格，越大越平滑。",
    analogy: "像是把最近几天的价格「抹平」画一条线，看整体方向而不是单日波动。",
    note: "短期均线（如MA5）上穿长期均线（如MA20）常被称为金叉，反之为死叉。",
  },
  {
    key: "rsi",
    term: "RSI（相对强弱指标）",
    category: "技术指标",
    aliases: ["RSI", "RSI14", "RSI(14)"],
    definition: "衡量近期上涨力度和下跌力度的比值，取值 0~100，用来判断买卖是否过热。",
    analogy: "有点像给最近的涨跌打分：分数越高说明买盘越狂热，越低说明卖盘越猛烈。",
    note: "常用经验：大于70视为超买（可能过热），小于30视为超卖（可能过冷）。",
  },
  {
    key: "macd",
    term: "MACD",
    category: "技术指标",
    aliases: ["MACD", "MACD DIF/DEA", "DIF", "DEA"],
    definition: "用两条不同速度的均线差值（DIF、DEA）来判断趋势的强弱与拐点。",
    note: "DIF 上穿 DEA 通常被视为偏多信号，下穿则偏空，但滞后性较明显。",
  },
  {
    key: "kdj",
    term: "KDJ（随机指标）",
    category: "技术指标",
    aliases: ["KDJ", "KDJ J"],
    definition: "根据近期最高价、最低价与收盘价的关系，衡量价格处在阶段高位还是低位。",
    note: "数值同样有超买超卖区间的参考用法，短线波动较大，易出假信号。",
  },
  {
    key: "boll",
    term: "BOLL（布林带）",
    category: "技术指标",
    aliases: ["BOLL", "BOLL 上轨", "BOLL 下轨", "布林带"],
    definition: "以均线为中轨，加减一定波动幅度画出上下两条轨道，用来观察价格是否偏离常态区间。",
    analogy: "像给价格划了一条正常波动的跑道，冲出跑道边缘往往意味着波动加剧。",
  },
  {
    key: "golden_cross",
    term: "金叉",
    category: "技术指标",
    aliases: ["金叉", "MA5 上穿 MA20"],
    definition: "短期均线从下方向上穿过长期均线，常被视为趋势转强的信号。",
    note: "只是历史规律，不代表一定会继续上涨，需结合其它信息判断。",
  },
  {
    key: "death_cross",
    term: "死叉",
    category: "技术指标",
    aliases: ["死叉", "MA5 下穿 MA20"],
    definition: "短期均线从上方向下穿过长期均线，常被视为趋势转弱的信号。",
    note: "只是历史规律，不代表一定会继续下跌，需结合其它信息判断。",
  },
  {
    key: "overbought",
    term: "超买",
    category: "技术指标",
    aliases: ["超买"],
    definition: "价格短期涨幅过大、买盘过热，指标进入历史上容易见顶回落的区间。",
  },
  {
    key: "oversold",
    term: "超卖",
    category: "技术指标",
    aliases: ["超卖"],
    definition: "价格短期跌幅过大、卖盘过猛，指标进入历史上容易止跌反弹的区间。",
  },
  {
    key: "candlestick",
    term: "K线",
    category: "基础概念",
    aliases: ["K线", "日K", "周K", "月K"],
    definition: "用一根柱子记录某个时间段内的开盘价、收盘价、最高价、最低价四个数据。",
    analogy: "红涨绿跌：柱身越长说明当期涨跌越猛烈，上下小细线代表最高/最低价探到的位置。",
  },

  // ---------------- 回测指标 ----------------
  {
    key: "backtest",
    term: "回测",
    category: "回测指标",
    aliases: ["回测"],
    definition: "用一套买卖规则，在历史行情数据上重放一遍，看看这套规则过去的表现如何。",
    note: "历史表现不代表未来一定重演，回测结果仅供参考。",
  },
  {
    key: "total_return",
    term: "策略总收益",
    category: "回测指标",
    aliases: ["策略总收益", "总收益"],
    definition: "回测区间内，按该策略买卖下来，资金总共涨了或跌了多少。",
  },
  {
    key: "benchmark_return",
    term: "基准(买入持有)",
    category: "回测指标",
    aliases: ["基准(买入持有)", "基准"],
    definition: "同一时间段里，如果一开始买入就一直不动，能获得的收益，用来和策略收益做对比。",
  },
  {
    key: "annualized_return",
    term: "年化收益",
    category: "回测指标",
    aliases: ["年化收益"],
    definition: "把回测区间的总收益，按复利折算成平均每年的收益率，方便和其它期限的结果比较。",
  },
  {
    key: "max_drawdown",
    term: "最大回撤",
    category: "回测指标",
    aliases: ["最大回撤"],
    definition: "在回测区间里，资金从阶段最高点到之后最低点，最多亏掉过的百分比。",
    analogy: "类似坐过山车时，从最高点跌到最低点那一段的落差，数值越大说明过程越惊险。",
    note: "衡量的是过程中最惨曾经有多惨，即使最终收益为正，回撤也可能很大。",
  },
  {
    key: "win_rate",
    term: "胜率",
    category: "回测指标",
    aliases: ["胜率"],
    definition: "所有交易里，赚钱的那部分交易占全部交易次数的比例。",
    note: "胜率高不等于赚得多：可能常赢小钱、偶尔输大钱，需要和收益一起看。",
  },
  {
    key: "sharpe",
    term: "夏普比率",
    category: "回测指标",
    aliases: ["夏普比率", "夏普"],
    definition: "衡量承担每一份波动风险，换来了多少收益的效率指标，数值越高越好。",
    analogy: "类似性价比：同样冒的风险，夏普比率高说明换到的回报更划算。",
    note: "一般认为大于1算不错，小于0说明承担了风险却没跑赢无风险收益。",
  },
  {
    key: "ma_cross_strategy",
    term: "均线交叉策略",
    category: "回测指标",
    aliases: ["均线交叉", "MA 快线上穿/下穿慢线"],
    definition: "短期均线（快线）上穿长期均线（慢线）时买入，下穿时卖出的一种趋势跟随策略。",
  },
  {
    key: "rsi_reversal_strategy",
    term: "RSI 反转策略",
    category: "回测指标",
    aliases: ["RSI 反转", "超卖买入、超买卖出"],
    definition: "RSI 进入超卖区间时买入、进入超买区间时卖出，押注价格会物极必反的策略。",
  },
  {
    key: "breakout_strategy",
    term: "通道突破策略",
    category: "回测指标",
    aliases: ["通道突破", "突破 N 日高点买入"],
    definition: "价格突破过去 N 天的最高点时买入，押注突破后趋势会延续的策略。",
  },
  {
    key: "ma_period",
    term: "快线周期 / 慢线周期",
    category: "回测指标",
    aliases: ["快线周期", "慢线周期"],
    definition: "均线计算所用的天数，天数越小越灵敏（快线），天数越大越平滑（慢线）。",
  },
  {
    key: "breakout_window",
    term: "突破窗口(日)",
    category: "回测指标",
    aliases: ["突破窗口", "突破窗口(日)"],
    definition: "判断新高/新低时回看的天数，例如20日窗口就是和过去20天的高低点比较。",
  },

  // ---------------- 信号规则 ----------------
  {
    key: "watchlist",
    term: "观察池",
    category: "信号规则",
    aliases: ["观察池"],
    definition: "你手动添加的、想持续关注的股票或加密货币清单，方便集中盯盘和接收信号提醒。",
  },
  {
    key: "abnormal_move",
    term: "异动",
    category: "信号规则",
    aliases: ["异动", "放量异动"],
    definition: "股价在短时间内出现明显超出日常波动幅度的涨跌，可能意味着有重要消息或资金动作。",
  },
  {
    key: "volume_spike",
    term: "放量",
    category: "信号规则",
    aliases: ["放量"],
    definition: "成交量明显超出近期平均水平，说明市场参与度突然提高。",
    note: "放量上涨通常偏积极，放量下跌则要警惕抛售压力。",
  },
  {
    key: "drawdown_alert",
    term: "回撤预警",
    category: "信号规则",
    aliases: ["回撤预警", "高位回撤预警"],
    definition: "价格从阶段高点下跌幅度达到设定比例时触发的提醒，帮助及时关注风险。",
  },
  {
    key: "breakout_signal",
    term: "突破 / 跌破",
    category: "信号规则",
    aliases: ["向上突破", "跌破"],
    definition: "价格超过（突破）或跌穿（跌破）过去一段时间的最高/最低点。",
  },

  // ---------------- 资讯与情绪 ----------------
  {
    key: "sentiment_score",
    term: "AI 情绪分",
    category: "资讯与情绪",
    aliases: ["情绪分", "AI 情绪分", "情绪解读"],
    definition: "AI 阅读资讯标题与摘要后，给出的一个 -1（偏负面）到 1（偏正面）的语气倾向打分。",
    note: "只反映资讯说话的语气是正面还是负面，不是买卖建议，也不保证股价会同向变化。",
  },
  {
    key: "bullish_label",
    term: "偏多",
    category: "资讯与情绪",
    aliases: ["偏多"],
    definition: "AI 判断这条资讯整体语气偏正面、积极。",
  },
  {
    key: "bearish_label",
    term: "偏空",
    category: "资讯与情绪",
    aliases: ["偏空"],
    definition: "AI 判断这条资讯整体语气偏负面、消极。",
  },
  {
    key: "neutral_label",
    term: "中性",
    category: "资讯与情绪",
    aliases: ["中性"],
    definition: "AI 判断这条资讯语气不明显偏向正面或负面，或本身以客观陈述为主。",
  },

  // ---------------- 基础概念 ----------------
  {
    key: "evidence_tag",
    term: "证据编号 [E1]",
    category: "基础概念",
    aliases: ["证据编号", "E1", "[E1]"],
    definition: "研报正文里数字或结论后面跟着的编号，点击可以在右侧证据面板看到这句话具体来自哪一次真实数据查询。",
  },
];

const norm = (s: string) => s.trim().toLowerCase();

/** 按 key 精确查找（推荐：代码里明确知道要展示哪个词条时使用） */
export function getGlossaryByKey(key: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.key === key);
}

/** 按界面上出现的原始文案模糊查找（term 全等 / alias 全等 / key 全等，不区分大小写） */
export function findGlossaryEntry(text: string): GlossaryEntry | undefined {
  const t = norm(text);
  if (!t) return undefined;
  return GLOSSARY.find(
    (e) => norm(e.term) === t || norm(e.key) === t || e.aliases?.some((a) => norm(a) === t)
  );
}

export function glossaryByCategory(): Record<GlossaryCategory, GlossaryEntry[]> {
  const out = {} as Record<GlossaryCategory, GlossaryEntry[]>;
  for (const e of GLOSSARY) {
    (out[e.category] ??= []).push(e);
  }
  return out;
}
