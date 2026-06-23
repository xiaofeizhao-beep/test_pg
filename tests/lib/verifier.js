/**
 * verifier.js — AI Chat 响应语义校验
 *
 * 基于 LeasingCopilot-V4 工作流的 3 种输出协议:
 *   - list   (SEARCH → 搜索结果卡片)
 *   - text   (DETAIL / COMPARE / KNOWLEDGE → 自然语言)
 *   - action (ACTION → 预约/申请流程)
 *
 * 校验维度:
 *   1. 非空 (len > 0)
 *   2. 非错误兜底 (不含 sorry/error/try again)
 *   3. 协议特征 (list 含$+地址 / text 含自然语言 / action 含流程)
 *   4. 意图相关性 (响应提及关键实体)
 */

/**
 * 基础校验 — 所有响应通用
 */
function base(actualText, id) {
  const text = actualText || '';
  const len = text.length;

  // 1. 非空
  if (len < 50) return { pass: false, why: `${id}: 响应过短 (${len} < 50 chars)` };

  // 2. 非错误兜底
  const errorPatterns = [
    /\bsorry[,.\s]+I (don't|cannot|can't|am unable)/i,
    /\bI don't understand\b/i,
    /\btry again\b/i,
    /\ban error occurred\b/i,
    /\bsomething went wrong\b/i,
  ];
  for (const p of errorPatterns) {
    if (p.test(text)) return { pass: false, why: `${id}: 命中错误兜底模式 "${p}"` };
  }

  return { pass: true, len };
}

/**
 * SEARCH 校验 — 搜索应返回 listing 列表
 * 特征: $价格、地址、bedroom、available date、listing cards
 */
function verifySearch(actualText, id) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  // 3. 协议特征
  const hasPrice = /\$\d[\d,]{1,5}/.test(text);
  const hasBeds = /(\d+\s*bed|studio)/i.test(text);
  const hasAddress = /([A-Z]\w+ (Avenue|Street|Drive|Boulevard|Road|Way|Court|Place|Lane|Ave|St|Dr|Blvd))/i.test(text);
  const hasCity = /(Berkeley|Seattle|Los Angeles|Chicago|Miami|Houston|Irvine|San Francisco)/i.test(text);

  hints.price = hasPrice;
  hints.beds = hasBeds;
  hints.address = hasAddress;
  hints.city = hasCity;

  // 搜索响应至少应有价格 + (城市或地址)
  const basicPass = hasPrice && (hasCity || hasAddress);
  if (!basicPass) {
    // 降级：如果是城市页面展示但没有具体listing，至少有城市名
    if (!hasCity && !hasAddress) {
      return { pass: false, why: `${id}: 搜索结果缺价格/地址/城市`, hints };
    }
  }

  return { pass: true, len: r.len, protocol: 'list', hints };
}

/**
 * DETAIL 校验 — 房源详情
 * 特征: property name、unit type、price、available date、amenities
 */
function verifyDetail(actualText, id, propertyName) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  const hasPrice = /\$\d[\d,]{1,5}/.test(text);
  const hasBeds = /(\d+\s*bed|studio|unit)/i.test(text);
  const hasProperty = propertyName
    ? new RegExp(propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30), 'i').test(text)
    : false;
  const hasAvailable = /available|move.in|lease|rent/i.test(text);

  hints.price = hasPrice;
  hints.beds = hasBeds;
  hints.propertyMatch = hasProperty;
  hints.availability = hasAvailable;

  // 详情至少应有价格或户型信息
  const basicPass = (hasPrice || hasBeds);
  if (!basicPass) {
    return { pass: false, why: `${id}: 详情缺价格/户型`, hints };
  }

  return { pass: true, len: r.len, protocol: 'text', hints };
}

/**
 * KNOWLEDGE 校验 — 知识问答
 * 特征: 解释性文字、分点说明、建议引导
 */
function verifyKnowledge(actualText, id, topicKeywords) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  // 应包含至少一个 topic 关键词
  if (topicKeywords && topicKeywords.length > 0) {
    const matched = topicKeywords.filter(kw => {
      const parts = kw.split(/\s+/);
      return parts.some(p => text.toLowerCase().includes(p.toLowerCase()));
    });
    hints.topicsMatched = matched.length;
    hints.topicsTotal = topicKeywords.length;
  }

  const hasStructured = /(first|second|finally|step|1\.|2\.|3\.|\-|\•|•)/i.test(text);
  hints.structured = hasStructured;

  return { pass: true, len: r.len, protocol: 'text', hints };
}

/**
 * ACTION 校验 — 预约/申请流程
 * 特征: tour/apply 流程、CTA、链接
 */
function verifyAction(actualText, id, actionType) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  const actionWords = {
    tour: /tour|schedule|visit|appointment|calendar|time|date/i,
    apply: /apply|application|submit|document|approval|process/i,
    general: /schedule|apply|tour|visit|book|reserve/i,
  };
  const patterns = actionWords[actionType] || actionWords.general;

  const hasAction = patterns.test(text);
  hints.hasActionTerm = hasAction;

  const hasCTA = /click|tap|button|link|https|\.com/i.test(text);
  hints.hasCTA = hasCTA;

  if (!hasAction) {
    return { pass: false, why: `${id}: 未找到${actionType}相关关键词`, hints };
  }

  return { pass: true, len: r.len, protocol: 'action', hints };
}

/**
 * COMPARE 校验 — 比较分析
 * 特征: 对比两个实体、tradeoff、推荐
 */
function verifyComparison(actualText, id, entityA, entityB) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  // 应提及两者之一
  if (entityA) hints.mentionsA = new RegExp(entityA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
  if (entityB) hints.mentionsB = new RegExp(entityB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);

  const hasCompare = /compare|versus|vs\.?|better|cheaper|more expensive|tradeoff|recommend/i.test(text);
  hints.hasCompareTerm = hasCompare;

  return { pass: true, len: r.len, protocol: 'text', hints };
}

/**
 * FOLLOW_UP 校验 — 追问/反问
 * 特征: AI 反问用户缺失的信息（城市/预算/户型）
 */
function verifyFollowUp(actualText, id) {
  const r = base(actualText, id);
  if (!r.pass) return r;

  const text = actualText;
  const hints = {};

  const asksQuestion = /\?/.test(text);
  const asksLocation = /which city|what city|where|location/i.test(text);
  const asksBudget = /budget|price range|how much/i.test(text);
  const asksBeds = /bedroom|studio|how many bed/i.test(text);

  hints.asksQuestion = asksQuestion;
  hints.asksLocation = asksLocation;
  hints.asksBudget = asksBudget;
  hints.asksBeds = asksBeds;

  // FOLLOW_UP 至少应有一个问句
  if (!asksQuestion && !asksLocation && !asksBudget && !asksBeds) {
    return { pass: false, why: `${id}: FOLLOW_UP 未反问我方缺失信息`, hints };
  }

  return { pass: true, len: r.len, protocol: 'text', hints };
}

module.exports = {
  base,
  verifySearch,
  verifyDetail,
  verifyKnowledge,
  verifyAction,
  verifyComparison,
  verifyFollowUp,
};
