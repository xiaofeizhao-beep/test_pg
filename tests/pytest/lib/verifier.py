"""
verifier.py — AI Chat 响应语义校验

基于 LeasingCopilot-V4 工作流的 3 种输出协议:
    - list   (SEARCH → 搜索结果卡片)
    - text   (DETAIL / COMPARE / KNOWLEDGE → 自然语言)
    - action (ACTION → 预约/申请流程)

校验维度:
    1. 非空 (len > 0)
    2. 非错误兜底 (不含 sorry/error/try again)
    3. 协议特征 (list 含$+地址 / text 含自然语言 / action 含流程)
    4. 意图相关性 (响应提及关键实体)

对应 tests/lib/verifier.js
"""

import re


def _base(actual_text: str, query_id: str) -> dict:
    """基础校验 — 所有响应通用"""
    text = actual_text or ''
    length = len(text)

    # 1. 非空
    if length < 50:
        return {'pass': False, 'why': f'{query_id}: 响应过短 ({length} < 50 chars)'}

    # 2. 非错误兜底
    error_patterns = [
        re.compile(r"\bsorry[,.\s]+I (don't|cannot|can't|am unable)", re.IGNORECASE),
        re.compile(r"\bI don't understand\b", re.IGNORECASE),
        re.compile(r"\btry again\b", re.IGNORECASE),
        re.compile(r"\ban error occurred\b", re.IGNORECASE),
        re.compile(r"\bsomething went wrong\b", re.IGNORECASE),
    ]
    for p in error_patterns:
        if p.search(text):
            return {'pass': False, 'why': f'{query_id}: 命中错误兜底模式 "{p.pattern}"'}

    return {'pass': True, 'len': length}


def verify_search(actual_text: str, query_id: str) -> dict:
    """
    SEARCH 校验 — 搜索应返回 listing 列表
    特征: $价格、地址、bedroom、available date、listing cards
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    # 3. 协议特征
    has_price = bool(re.search(r'\$\d[\d,]{1,5}', text))
    has_beds = bool(re.search(r'(\d+\s*bed|studio)', text, re.IGNORECASE))
    has_address = bool(re.search(
        r'([A-Z]\w+ (Avenue|Street|Drive|Boulevard|Road|Way|Court|Place|Lane|Ave|St|Dr|Blvd))',
        text, re.IGNORECASE))
    has_city = bool(re.search(
        r'(Berkeley|Seattle|Los Angeles|Chicago|Miami|Houston|Irvine|San Francisco)',
        text, re.IGNORECASE))

    hints['price'] = has_price
    hints['beds'] = has_beds
    hints['address'] = has_address
    hints['city'] = has_city

    # 搜索响应至少应有价格 + (城市或地址)
    basic_pass = has_price and (has_city or has_address)
    if not basic_pass:
        # 降级：如果是城市页面展示但没有具体listing，至少有城市名
        if not has_city and not has_address:
            return {'pass': False, 'why': f'{query_id}: 搜索结果缺价格/地址/城市', 'hints': hints}

    return {'pass': True, 'len': r['len'], 'protocol': 'list', 'hints': hints}


def verify_detail(actual_text: str, query_id: str, property_name: str = '') -> dict:
    """
    DETAIL 校验 — 房源详情
    特征: property name、unit type、price、available date、amenities
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    has_price = bool(re.search(r'\$\d[\d,]{1,5}', text))
    has_beds = bool(re.search(r'(\d+\s*bed|studio|unit)', text, re.IGNORECASE))
    has_property = False
    if property_name:
        # 安全转义后匹配
        safe_name = re.escape(property_name[:30])
        has_property = bool(re.search(safe_name, text, re.IGNORECASE))
    has_available = bool(re.search(r'available|move.in|lease|rent', text, re.IGNORECASE))

    hints['price'] = has_price
    hints['beds'] = has_beds
    hints['propertyMatch'] = has_property
    hints['availability'] = has_available

    # 详情至少应有价格或户型信息
    basic_pass = has_price or has_beds
    if not basic_pass:
        return {'pass': False, 'why': f'{query_id}: 详情缺价格/户型', 'hints': hints}

    return {'pass': True, 'len': r['len'], 'protocol': 'text', 'hints': hints}


def verify_knowledge(actual_text: str, query_id: str, topic_keywords: list = None) -> dict:
    """
    KNOWLEDGE 校验 — 知识问答
    特征: 解释性文字、分点说明、建议引导
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    # 应包含至少一个 topic 关键词
    if topic_keywords:
        matched = 0
        for kw in topic_keywords:
            parts = kw.split()
            if any(p.lower() in text.lower() for p in parts):
                matched += 1
        hints['topicsMatched'] = matched
        hints['topicsTotal'] = len(topic_keywords)

    has_structured = bool(re.search(
        r'(first|second|finally|step|1\.|2\.|3\.|\-|\•|•)', text, re.IGNORECASE))
    hints['structured'] = has_structured

    return {'pass': True, 'len': r['len'], 'protocol': 'text', 'hints': hints}


def verify_action(actual_text: str, query_id: str, action_type: str = 'general') -> dict:
    """
    ACTION 校验 — 预约/申请流程
    特征: tour/apply 流程、CTA、链接
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    action_words = {
        'tour': re.compile(r'tour|schedule|visit|appointment|calendar|time|date', re.IGNORECASE),
        'apply': re.compile(r'apply|application|submit|document|approval|process', re.IGNORECASE),
        'general': re.compile(r'schedule|apply|tour|visit|book|reserve', re.IGNORECASE),
    }
    patterns = action_words.get(action_type, action_words['general'])

    has_action = bool(patterns.search(text))
    hints['hasActionTerm'] = has_action

    has_cta = bool(re.search(r'click|tap|button|link|https|\.com', text, re.IGNORECASE))
    hints['hasCTA'] = has_cta

    if not has_action:
        return {'pass': False, 'why': f'{query_id}: 未找到{action_type}相关关键词', 'hints': hints}

    return {'pass': True, 'len': r['len'], 'protocol': 'action', 'hints': hints}


def verify_comparison(actual_text: str, query_id: str,
                      entity_a: str = '', entity_b: str = '') -> dict:
    """
    COMPARE 校验 — 比较分析
    特征: 对比两个实体、tradeoff、推荐
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    # 应提及两者之一
    if entity_a:
        hints['mentionsA'] = bool(re.search(re.escape(entity_a), text, re.IGNORECASE))
    if entity_b:
        hints['mentionsB'] = bool(re.search(re.escape(entity_b), text, re.IGNORECASE))

    has_compare = bool(re.search(
        r'compare|versus|vs\.?|better|cheaper|more expensive|tradeoff|recommend',
        text, re.IGNORECASE))
    hints['hasCompareTerm'] = has_compare

    return {'pass': True, 'len': r['len'], 'protocol': 'text', 'hints': hints}


def verify_follow_up(actual_text: str, query_id: str) -> dict:
    """
    FOLLOW_UP 校验 — 追问/反问
    特征: AI 反问用户缺失的信息（城市/预算/户型）
    """
    r = _base(actual_text, query_id)
    if not r['pass']:
        return r

    text = actual_text
    hints = {}

    asks_question = '?' in text
    asks_location = bool(re.search(r'which city|what city|where|location', text, re.IGNORECASE))
    asks_budget = bool(re.search(r'budget|price range|how much', text, re.IGNORECASE))
    asks_beds = bool(re.search(r'bedroom|studio|how many bed', text, re.IGNORECASE))

    hints['asksQuestion'] = asks_question
    hints['asksLocation'] = asks_location
    hints['asksBudget'] = asks_budget
    hints['asksBeds'] = asks_beds

    # FOLLOW_UP 至少应有一个问句
    if not asks_question and not asks_location and not asks_budget and not asks_beds:
        return {'pass': False, 'why': f'{query_id}: FOLLOW_UP 未反问我方缺失信息', 'hints': hints}

    return {'pass': True, 'len': r['len'], 'protocol': 'text', 'hints': hints}
