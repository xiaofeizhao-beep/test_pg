"""
queries.py — AI Chat 测试查询配置

对应 tests/lib/queries.json
"""

# 基础 URL
base_url = "https://website-dev.unitpulse.ai"

# 超时配置 (毫秒)
timeout = {
    'page_load': 20000,
    'submit_default': 10,  # 秒
    'page_settle': 2000,
    'dropdown': 400,
}

# 视口
viewport = {'width': 1440, 'height': 900}

# 浏览器配置
browser_config = {
    'headless': False,
    'channel': 'chrome',
    'args': ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    'locale': 'en-US',
}

# Composer 组件 testid
composer_elements = [
    'composer-nl', 'composer-search', 'composer-location',
    'composer-beds', 'composer-budget', 'composer-movein',
]

# 下拉框配置: (testid, 选项类别名)
composer_dropdowns = [
    ('composer-location', 'cities'),
    ('composer-beds', 'beds'),
    ('composer-budget', 'budgets'),
    ('composer-movein', 'movein'),
]

# Phase 2: 基础搜索查询
phase2 = [
    {'id': 'TEST-001a', 'q': '5634A Brooklyn Ave NE, Seattle, WA 98105 (The Grey House), show me the video', 'w': 12},
    {'id': 'TEST-001b', 'q': 'Can you also send me the photos of this property?', 'w': 10},
    {'id': 'TEST-002a', 'q': '2071', 'w': 10},
    {'id': 'TEST-002b', 'q': '2701 Durant Avenue, Berkeley, CA 94704', 'w': 10},
    {'id': 'TEST-003a', 'q': 'Find apartments in Miami', 'w': 10},
    {'id': 'TEST-003b', 'q': 'Try a different city', 'w': 10},
    {'id': 'TEST-004a', 'q': 'Berkeley, CA near good schools, budget 1400-2700', 'w': 10},
    {'id': 'TEST-004b', 'q': '1,400-2,700 dollars, 2 bedrooms, Parking, in Berkeley, CA near good schools', 'w': 10},
    {'id': 'EXTRA-001', 'q': 'What is available near UC Berkeley campus?', 'w': 10},
    {'id': 'EXTRA-002', 'q': 'Does 2315 College Avenue have a video tour?', 'w': 10},
]

# Phase 3: 多城市
phase3 = [
    {'name': 'Berkeley', 'q': '2 bedroom apartments in Berkeley under $3000'},
    {'name': 'Seattle', 'q': 'Studio and 1-bedroom apartments in Seattle under $2500'},
    {'name': 'LosAngeles', 'q': 'apartments with pool and gym', 'useSelector': 'Los Angeles'},
]

# Phase 4: 扩展对话
phase4 = [
    {'id': 'TC-005', 'q': 'What does $2,000 get me in Berkeley compared to Seattle?'},
    {'id': 'TC-006', 'q': 'Show me apartments with in-unit washer and dryer only'},
    {'id': 'TC-007', 'q': 'I need to move in within the next 2 weeks, what is available?'},
    {'id': 'TC-008', 'q': 'I have a cat and a small dog. What are the pet fees and restrictions?'},
    {'id': 'TC-009', 'q': 'Which neighborhoods in Berkeley are safest with good walkability?'},
    {'id': 'TC-010', 'q': 'How much are utilities? What is the real total monthly cost for a 1-bedroom?'},
    {'id': 'TC-011', 'q': 'Find apartments with short-term or month-to-month leases in Berkeley'},
    {'id': 'TC-012', 'q': 'What is the cheapest 1-bedroom apartment available right now?'},
]

# Phase 5: 物业详情 + 费用/申请/看房
phase5 = [
    {'id': 'DETAIL-001', 'q': 'I want to know the availability for 2315 College Avenue in Berkeley. What rooms can I rent?'},
    {'id': 'DETAIL-002', 'q': 'Tell me everything about 2701 Durant Avenue — available units, prices, floor plans, and move-in dates'},
    {'id': 'DETAIL-003', 'q': 'What is the cheapest available unit at 2124 Parker Street?'},
    {'id': 'DETAIL-004', 'q': 'How many units are currently available at The Grey House on Brooklyn Ave in Seattle?'},
    {'id': 'DETAIL-005', 'q': 'Show me all studio units available at Nari Koreatown in Los Angeles'},
    {'id': 'DETAIL-006', 'q': 'What is the soonest move-in date for any 1-bedroom in Berkeley?'},
    {'id': 'DETAIL-007', 'q': 'I am interested in 2715 Dwight Way. Show me the 2-bedroom units available and their individual prices.'},
    {'id': 'DETAIL-008', 'q': 'Compare availability: 2315 College vs 2618 College — which one has more units ready to move in August?'},
]

# 费用/申请/看房 — 完整查询列表 (Phase5 CostTour)
cost_tour_queries = [
    # 费用明细 — KNOWLEDGE
    {'id': 'COST-001', 'q': 'How much are utilities typically for a 1-bedroom apartment in Berkeley? Electric, water, gas, internet — break it down.', 'proto': 'knowledge', 'topics': ['utilities', 'electric', 'water', 'gas', 'internet', 'Berkeley']},
    {'id': 'COST-002', 'q': 'What is the security deposit usually? First month, last month, any other fees upfront?', 'proto': 'knowledge', 'topics': ['deposit', 'month', 'fee', 'upfront']},
    {'id': 'COST-003', 'q': 'I have a cat, what are the typical pet deposits and monthly pet rent in these apartments?', 'proto': 'knowledge', 'topics': ['pet', 'deposit', 'cat', 'rent']},
    {'id': 'COST-004', 'q': 'Show me the total monthly cost for a 2-bedroom at 2701 Durant Avenue including ALL fees — rent, utilities, parking, pet, everything.', 'proto': 'detail', 'propName': '2701 Durant Avenue'},
    {'id': 'COST-005', 'q': 'What parking options are available and how much does parking cost per month in Berkeley apartments?', 'proto': 'knowledge', 'topics': ['parking', 'cost', 'Berkeley']},
    # 申请流程 — KNOWLEDGE
    {'id': 'APPLY-001', 'q': 'How do I apply for an apartment? Walk me through the process step by step.', 'proto': 'knowledge', 'topics': ['apply', 'process', 'step']},
    {'id': 'APPLY-002', 'q': 'What documents do I need to prepare before applying? Do I need pay stubs, bank statements, reference letters?', 'proto': 'knowledge', 'topics': ['document', 'pay stub', 'bank', 'reference']},
    {'id': 'APPLY-003', 'q': 'What are the lease terms? Do you have 6-month, 12-month, or month-to-month options?', 'proto': 'knowledge', 'topics': ['lease', 'month', 'term']},
    {'id': 'APPLY-004', 'q': 'Is there an application fee? How long does approval usually take?', 'proto': 'knowledge', 'topics': ['application fee', 'approval']},
    # 看房预约 — ACTION
    {'id': 'TOUR-001', 'q': 'I want to schedule a tour for 2315 College Avenue in Berkeley. What times are available this week?', 'proto': 'action', 'actionType': 'tour'},
    {'id': 'TOUR-002', 'q': 'Can I do a virtual tour instead of in-person? What virtual tour options do you have?', 'proto': 'knowledge', 'topics': ['virtual', 'tour', 'in-person']},
    {'id': 'TOUR-003', 'q': 'I want to see 3 apartments in one afternoon. Can I schedule back-to-back tours? How long is each tour?', 'proto': 'action', 'actionType': 'tour'},
    {'id': 'TOUR-004', 'q': 'What should I bring to the tour? What questions should I ask the landlord?', 'proto': 'knowledge', 'topics': ['bring', 'tour', 'question', 'landlord']},
    # 综合 — COMPARE + ACTION
    {'id': 'COST-006', 'q': 'Compare the total cost of living: 1-bedroom in Berkeley vs 1-bedroom in Seattle. Include rent, utilities, parking, and any city-specific costs.', 'proto': 'compare', 'entityA': 'Berkeley', 'entityB': 'Seattle'},
    {'id': 'TOUR-005', 'q': 'I found an apartment I like, I want to apply AND schedule a tour. What do I do first? Can you start the process?', 'proto': 'action', 'actionType': 'general'},
]
