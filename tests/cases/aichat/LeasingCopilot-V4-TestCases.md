# UnitPulse Leasing Copilot V4 — 问答预期测试用例

> **来源**: Dify 工作流 `[uni-8] leasing_copilot_v4.yml` + 现有 AIChat 用例  
> **路由架构**: 单次 Router Extractor (LLM gpt-4.1-mini) → 7 大类 (SEARCH/DETAIL/COMPARE/ACTION/KNOWLEDGE/FOLLOW_UP) → 38 个细分场景  
> **输出协议**: text / list / action 三种前端合约  
> **生成日期**: 2025-07-16

---

## 工作流架构概览

```
[User Input]
    │
    ▼
[00_intake_user_history] → [03_router_extractor] → [03_router_parse_json]
    │
    ▼
[05_route_switch] (intent_family 一级路由)
    │
    ├── SEARCH    → if_a_subcase (A1-A7) + if_b_subcase (B1-B5)
    ├── FOLLOW_UP → if_c_subcase (C1-C6) + G3 + D5
    ├── DETAIL    → if_b_subcase → if_e_subcase (E1-E5)
    ├── COMPARE   → if_f_subcase (F1-F7)
    ├── ACTION    → D3/D4/E2 → [40_action_resolve_and_emit]
    └── KNOWLEDGE → D1/D2/D6/H1-H3 → [50_knowledge_answerer]
```

### 5 类执行器

| 执行器 | 输出协议 | 说明 |
|--------|---------|------|
| `10_search_execute` | list | 调用 Astra DB + 推荐服务 → `90_format_list` 渲染 listing cards |
| `20_detail_fetch_and_format` | text | 查 Astra properties/units → 结构化文本 + suggestedReplies |
| `30_compare_reasoner` | text | LLM 比较分析 → `90_format_text` |
| `40_action_resolve_and_emit` | action | 预约/申请意图 → `90_format_action` |
| `50_knowledge_answerer` | text | 知识问答 → `90_format_text` |

### 会话变量 (Conversation Variables)

| 变量 | 类型 | 说明 |
|------|------|------|
| `brief_location` | string | 已确认位置 |
| `brief_bedrooms` | int | 已确认卧室数 (-1=未知) |
| `brief_min_price` | int | 预算下限 |
| `brief_max_price` | int | 预算上限 |
| `brief_amenities` | array[string] | 已确认设施 |
| `brief_move_in_date` | string | 入住时间 |
| `current_view_property_id/name` | string | 当前查看房源 |
| `last_search_results_json` | string | 最近搜索结果 |
| `compare_priority` | string | 比较优先级: budget/location/amenities |
| `session_language` | string | 会话语言 |
| `conversation_history` | array[string] | 精简会话历史 |

---

## 一、SEARCH 大类 — 直接搜索

### A 组: A_DIRECT_SEARCH (有位置 + 筛选条件)

---

#### A1: 位置+卧室+预算+入住时间，全维度直接搜索

| 属性 | 内容 |
|------|------|
| **Route Code** | `A1` |
| **Scenario** | `A1_exact_search_full` |
| **目标执行器** | `search` → `10_search_execute` |
| **当前 AIChat 覆盖** | Phase2 (TEST-004a/b), Phase3 (Berkeley/Seattle), Phase5 (DETAIL-006) |

**Q1: Los Angeles 2 bed under $2500 move in August**
- **预期路由**: SEARCH → A1
- **预期提取**: `location="Los Angeles"`, `bedrooms=2`, `max_price=2500`, `move_in_date="August"`
- **预期输出**: list 协议，展示 LA 2BR ≤$2500 房源卡片 + 不修改条件可直接看下一批

**Q2: Berkeley CA 2 bedrooms, budget 1400-2700, parking, move in September**
- **预期路由**: SEARCH → A1
- **预期提取**: `location="Berkeley CA"`, `bedrooms=2`, `min_price=1400`, `max_price=2700`, `amenities=["parking"]`, `move_in_date="September"`
- **预期输出**: list 协议，Berkeley 2BR $1400-$2700 带停车位 + 8月可入住

**Q3: studio near UCLA under $1800 available now**
- **预期路由**: SEARCH → A1
- **预期提取**: `location="UCLA"`, `bedrooms=0` (studio), `max_price=1800`
- **预期输出**: list 协议，UCLA 附近 studio ≤$1800

---

#### A2: 位置+预算，先出结果并提示可按卧室筛选

| 属性 | 内容 |
|------|------|
| **Route Code** | `A2` |
| **Scenario** | `A2_location_budget_search` |
| **目标执行器** | `search` |

**Q4: apartments in Seattle under $2000**
- **预期路由**: SEARCH → A2
- **预期提取**: `location="Seattle"`, `max_price=2000`, `bedrooms=-1`
- **预期输出**: list 协议 + suggestedReplies 含 "1 bedroom" / "2 bedroom" / "studio" 引导按户型筛选

**Q5: Berkeley apartments around $2000**
- **预期路由**: SEARCH → A2
- **预期提取**: `location="Berkeley"`, `min_price=1600`, `max_price=2400` (≈$2000 → 0.8x~1.2x)
- **预期输出**: list 协议，$1600-$2400 区间 + 引导选户型

---

#### A3: 位置+户型，直接检索匹配房源

| 属性 | 内容 |
|------|------|
| **Route Code** | `A3` |
| **Scenario** | `A3_location_bedroom_search` |
| **目标执行器** | `search` |
| **当前 AIChat 覆盖** | Phase3 (Berkeley: 2 bedroom under $3000) |

**Q6: 2 bedroom apartments in Berkeley under $3000**
- **预期路由**: SEARCH → A3
- **预期提取**: `location="Berkeley"`, `bedrooms=2`, `max_price=3000`
- **预期输出**: list 协议 + suggestedReplies 引导调整预算/添加amenity

**Q7: 1 bedroom in downtown Seattle**
- **预期路由**: SEARCH → A3 (位置+户型)
- **预期提取**: `location="downtown Seattle"`, `bedrooms=1`
- **预期输出**: list 协议，downtown Seattle 1BR

---

#### A4: 位置+明确 amenity，直接作为过滤条件

| 属性 | 内容 |
|------|------|
| **Route Code** | `A4` |
| **Scenario** | `A4_location_amenity_search` |
| **目标执行器** | `search` |

**Q8: apartments with pool and gym in Los Angeles**
- **预期路由**: SEARCH → A4
- **预期提取**: `location="Los Angeles"`, `amenities=["pool","gym"]`
- **预期输出**: list 协议，LA 带泳池+健身房房源

**Q9: pet friendly apartments in Berkeley**
- **预期路由**: SEARCH → A4
- **预期提取**: `location="Berkeley"`, `amenities=["pet_friendly"]`
- **预期输出**: list 协议 + suggestedReplies 引导添加预算/户型

---

#### A5: 位置+入住时间，优先展示可入住房源

| 属性 | 内容 |
|------|------|
| **Route Code** | `A5` |
| **Scenario** | `A5_location_movein_search` |
| **目标执行器** | `search` |

**Q10: apartments in Berkeley available in August**
- **预期路由**: SEARCH → A5
- **预期提取**: `location="Berkeley"`, `move_in_date="August"`
- **预期输出**: list 协议，优先展示 8月可入住房源

---

#### A6: 位置+两个及以上筛选条件

| 属性 | 内容 |
|------|------|
| **Route Code** | `A6` |
| **Scenario** | `A6_location_multi_filter_search` |
| **目标执行器** | `search` |

**Q11: 2 bedroom in Berkeley under $2800, in-unit laundry, available July**
- **预期路由**: SEARCH → A6
- **预期提取**: `location="Berkeley"`, `bedrooms=2`, `max_price=2800`, `amenities=["in_unit_laundry"]`, `move_in_date="July"`
- **预期输出**: list 协议，多条件过滤

---

#### A7: 指定房源名/房源详情查询 (不走泛搜索，route to DETAIL)

| 属性 | 内容 |
|------|------|
| **Route Code** | `A7` |
| **Scenario** | `A7_named_property_lookup` |
| **目标执行器** | `detail` |
| **当前 AIChat 覆盖** | Phase2 (TEST-001a: The Grey House, TEST-002b: 2701 Durant) |

**Q12: Tell me about 2701 Durant Avenue in Berkeley**
- **预期路由**: DETAIL → `20_detail_fetch_and_format`
- **预期提取**: `property_name="2701 Durant Avenue"`
- **预期输出**: text 协议 "2701 Durant Avenue: <addr>; rent $X,XXX/mo; bedrooms X; amenities ..." + suggestedReplies

**Q13: 5634A Brooklyn Ave NE Seattle The Grey House, show me the video**
- **预期路由**: DETAIL → `20_detail_fetch_and_format`
- **预期提取**: `property_name="The Grey House"` or `property_name="5634A Brooklyn Ave NE"`
- **预期输出**: text 协议 + video block (如果有 media_video_url)

**Q14: Show me photos of 2315 College Avenue**
- **预期路由**: DETAIL → `20_detail_fetch_and_format`
- **预期提取**: `property_name="2315 College Avenue"`
- **预期输出**: text 协议 + gallery block (如果有 media_picture_url) 或 fallback "暂无照片"

---

### B 组: B_LOCATION_ONLY (仅有位置，无筛选条件)

---

#### B1: 只有城市，直接展示城市级房源并引导筛选

| 属性 | 内容 |
|------|------|
| **Route Code** | `B1` |
| **Scenario** | `B1_city_only_search` |
| **目标执行器** | `search` |
| **当前 AIChat 覆盖** | Phase2 (TEST-003a: Find apartments in Miami) |

**Q15: apartments in Los Angeles**
- **预期路由**: SEARCH → B1
- **预期提取**: `location="Los Angeles"`, `location_kind="city"`, `search_ready=true`
- **预期输出**: list 协议 + suggestedReplies 引导选户型/预算/入住时间

**Q16: Show me listings in Berkeley**
- **预期路由**: SEARCH → B1
- **预期提取**: `location="Berkeley"`
- **预期输出**: list 协议 + 引导筛选

---

#### B2: 学校/地标附近，默认半径搜索

| 属性 | 内容 |
|------|------|
| **Route Code** | `B2` |
| **Scenario** | `B2_landmark_nearby_search` |
| **目标执行器** | `search` |

**Q17: near USC pet friendly**
- **预期路由**: SEARCH → B2
- **预期提取**: `location="USC"`, `location_kind="landmark"`, `amenities=["pet_friendly"]`, `radius_miles=3`
- **预期输出**: list 协议，USC 3mi 范围内 pet friendly

**Q18: What is available near UC Berkeley campus?**
- **预期路由**: SEARCH → B2
- **预期提取**: `location="UC Berkeley"`, `location_kind="landmark"`
- **预期输出**: list 协议，UC Berkeley 周围 3mi

---

#### B3: 街区/区域名直接作为区域检索

| 属性 | 内容 |
|------|------|
| **Route Code** | `B3` |
| **Scenario** | `B3_neighborhood_search` |
| **目标执行器** | `search` |

**Q19: apartments in Koreatown Los Angeles**
- **预期路由**: SEARCH → B3
- **预期提取**: `location="Koreatown"`, `location_kind="neighborhood"`
- **预期输出**: list 协议，Koreatown 区域的房源

**Q20: Silver Lake apartments**
- **预期路由**: SEARCH → B3
- **预期提取**: `location="Silver Lake"`, `location_kind="neighborhood"`
- **预期输出**: list 协议

---

#### B4: 具体地址/路口附近搜索

| 属性 | 内容 |
|------|------|
| **Route Code** | `B4` |
| **Scenario** | `B4_address_intersection_nearby_search` |
| **目标执行器** | `search` |

**Q21: apartments near 2701 Durant Avenue Berkeley**
- **预期路由**: SEARCH → B4
- **预期提取**: `location="2701 Durant Avenue Berkeley"`, `location_kind="address"`
- **预期输出**: list 协议，该地址附近的房源

---

#### B5: 通勤/公交/地铁锚点附近搜索

| 属性 | 内容 |
|------|------|
| **Route Code** | `B5` |
| **Scenario** | `B5_commute_transit_anchor_search` |
| **目标执行器** | `search` |

**Q22: apartments near BART station in Berkeley**
- **预期路由**: SEARCH → B5
- **预期提取**: `location="BART station Berkeley"`, `location_kind="transit"`
- **预期输出**: list 协议，BART 站附近房源

**Q23: places within 30 min commute to downtown Seattle**
- **预期路由**: SEARCH → B5
- **预期提取**: `location="downtown Seattle"`, `location_kind="transit"`
- **预期输出**: list 协议

---

## 二、FOLLOW_UP 大类 — 缺位置需要追问

### C 组: C_NEED_LOCATION (缺位置，补问)

| 属性 | 内容 |
|------|------|
| **共同输出协议** | text (通过 `00_intake_followup_copywriter` → `90_format_followup`) |
| **核心原则** | 只问 location，不追问其他维度 |

---

#### C1: Hi/Hello/I need apartment，只问城市

| 属性 | 内容 |
|------|------|
| **Route Code** | `C1` |
| **Scenario** | `C1_greeting_blank` |

**Q24: Hi**
- **预期路由**: FOLLOW_UP → C1
- **预期提取**: `search_ready=false`
- **预期输出**: text — 打招呼 + 询问想找哪个城市的房源 + suggestedReplies: ["Los Angeles", "Berkeley", "Seattle"]

**Q25: I need an apartment**
- **预期路由**: FOLLOW_UP → C1
- **预期提取**: `search_ready=false`
- **预期输出**: text — 询问城市偏好 + suggestedReplies

---

#### C2: 只有预算，只补 location

| 属性 | 内容 |
|------|------|
| **Route Code** | `C2` |
| **Scenario** | `C2_budget_only` |

**Q26: My budget is $2000**
- **预期路由**: FOLLOW_UP → C2
- **预期提取**: `max_price=2000`, `search_ready=false`
- **预期输出**: text — 确认预算 $2000，问想在哪个城市找 + suggestedReplies

**Q27: Under $1500**
- **预期路由**: FOLLOW_UP → C2
- **预期提取**: `max_price=1500`, `min_price=-1`
- **预期输出**: text — 问城市

---

#### C3: 只有户型，优先补 location

| 属性 | 内容 |
|------|------|
| **Route Code** | `C3` |
| **Scenario** | `C3_bedroom_only` |

**Q28: I need a 2 bedroom**
- **预期路由**: FOLLOW_UP → C3
- **预期提取**: `bedrooms=2`, `search_ready=false`
- **预期输出**: text — 确认 2BR，问城市

**Q29: Looking for a studio**
- **预期路由**: FOLLOW_UP → C3
- **预期提取**: `bedrooms=0` (studio)
- **预期输出**: text — 确认 studio，问城市

---

#### C4: 只有 amenity，先问 location

| 属性 | 内容 |
|------|------|
| **Route Code** | `C4` |
| **Scenario** | `C4_amenity_only` |

**Q30: I need a place that allows dogs**
- **预期路由**: FOLLOW_UP → C4
- **预期提取**: `amenities=["pet_friendly"]`, `search_ready=false`
- **预期输出**: text — 确认 pet friendly，问城市

**Q31: Must have parking**
- **预期路由**: FOLLOW_UP → C4
- **预期提取**: `amenities=["parking"]`
- **预期输出**: text — 问城市

---

#### C5: 只有入住时间，先问 location

| 属性 | 内容 |
|------|------|
| **Route Code** | `C5` |
| **Scenario** | `C5_movein_only` |

**Q32: I need to move in September**
- **预期路由**: FOLLOW_UP → C5
- **预期提取**: `move_in_date="September"`, `search_ready=false`
- **预期输出**: text — 问城市

---

#### C6: 模糊诉求无位置

| 属性 | 内容 |
|------|------|
| **Route Code** | `C6` |
| **Scenario** | `C6_vague_lifestyle_no_location` |

**Q33: I want something affordable with good transit**
- **预期路由**: FOLLOW_UP → C6
- **预期提取**: `search_ready=false`
- **预期输出**: text — 问城市 preference

---

## 三、DETAIL 大类 — 房源详情查询

| 属性 | 内容 |
|------|------|
| **执行器** | `20_detail_fetch_and_format` (Python代码，含 Astra DB 查询 + property lookup) |
| **输出协议** | text（含 suggestedReplies + preferences） |

---

#### E1: 从当前查看房源直接查详情回答

| 属性 | 内容 |
|------|------|
| **Route Code** | `E1` |
| **Scenario** | `E1_viewing_property_qa` |
| **前置条件** | [Viewing property] 存在 |
| **当前 AIChat 覆盖** | Phase5 (DETAIL-001~008) |

**Q34: (正在看 2315 College Avenue) What rooms are available?**
- **预期路由**: DETAIL → E1 → `20_detail_fetch_and_format`
- **预期输出**: text 协议，列出 units: bedroom_num, price, available_date...

**Q35: (正在看 The Grey House) How many units are available?**
- **预期路由**: DETAIL → E1
- **预期输出**: text 协议，该 property 下 units 数量 + 价格区间

**Q36: (正在看某房源) Is this place pet friendly?**
- **预期路由**: DETAIL → E1
- **预期输出**: text 协议 "{name} appears to be pet-friendly" 或 "does not show a confirmed pet policy..."

**Q37: (正在看某房源) Does this place have parking?**
- **预期路由**: DETAIL → E1
- **预期输出**: text 协议 "{name} has parking-related info in the data" 或 "does not show clear parking info..."

---

#### E3: 在搜索结果基础上调整条件 (refine)

| 属性 | 内容 |
|------|------|
| **Route Code** | `E3` |
| **Scenario** | `E3_results_refine_current_set` |
| **前置条件** | 已有搜索结果 |
| **当前 AIChat 覆盖** | Phase4 (TC-006: in-unit washer/dryer only) |

**Q38: (已有 Berkeley 搜索结果) Only show me ones under $2,500**
- **预期路由**: SEARCH → E3
- **预期输出**: list 协议，在当前结果中过滤 ≤$2500

**Q39: (已有搜索结果) Remove the bedroom filter / 不限卧室**
- **预期路由**: SEARCH → E3
- **预期行为**: 去掉 bedrooms 维度重新搜索，不回问 location

**Q40: (已有搜索结果) Show only pet friendly ones**
- **预期路由**: SEARCH → E3
- **预期输出**: list 协议，添加 pet_friendly 过滤

---

#### E4: 从已展示结果中解析目标房源并查详情

| 属性 | 内容 |
|------|------|
| **Route Code** | `E4` |
| **Scenario** | `E4_showed_property_detail` |
| **前置条件** | [Showed properties] 有数据 |

**Q41: (搜索结果中有 The Grey House) Tell me about the first one**
- **预期路由**: DETAIL → E4
- **预期输出**: text 协议，解析 "first" 指向 [Showed properties][0]

**Q42: (结果中有多个房源) Show me details of the one on College Avenue**
- **预期路由**: DETAIL → E4
- **预期输出**: text 协议，按地址 "College Avenue" 匹配

---

#### E5: 用户问具体 unit/room 价格、空房或浴室信息

| 属性 | 内容 |
|------|------|
| **Route Code** | `E5` |
| **Scenario** | `E5_unit_room_detail` |

**Q43: What is the cheapest available unit at 2124 Parker Street?**
- **预期路由**: DETAIL → E5
- **预期输出**: text 协议，列出最便宜的 unit

**Q44: Show me all studio units at Nari Koreatown**
- **预期路由**: DETAIL → E5
- **预期输出**: text 协议，Nari Koreatown 所有 studio units

---

## 四、COMPARE 大类 — 比较分析

| 属性 | 内容 |
|------|------|
| **执行器** | `30_compare_reasoner` (LLM gpt-4.1-mini) → `90_format_text` |
| **输出协议** | text (自然语言 3-6 句 + SUGGESTED_REPLIES) |
| **当前 AIChat 覆盖** | Phase5 (COST-006: compare Berkeley vs Seattle) |

---

#### F1/F2: 房源 vs 房源比较

| 属性 | F1 | F2 |
|------|----|----|
| **Route Code** | `F1` | `F2` |
| **Scenario** | `F1_property_vs_property_need_priority` | `F2_property_vs_property_compare` |
| **条件** | 优先级缺失 | 优先级已明确 |
| **目标** | ask_priority | compare |

**Q45: Compare these two** (无优先级)
- **预期路由**: COMPARE → F1
- **预期输出**: text — 问 "What matters most — budget, location, or amenities?" + suggestedReplies

**Q46: Compare these two, budget matters most**
- **预期路由**: COMPARE → F2
- **预期输出**: text — 指出更便宜/性价比更高的，说明 tradeoff，推荐

---

#### F3/F4: 区域 vs 区域比较

| 属性 | F3 | F4 |
|------|----|----|
| **Route Code** | `F3` | `F4` |
| **Scenario** | `F3_area_vs_area_compare` | `F4_area_vs_area_need_priority` |
| **条件** | 优先级已明确 | 优先级缺失 |

**Q47: Koreatown vs Silver Lake, which has better commute?**
- **预期路由**: COMPARE → F3 (priority=location/commute)
- **预期输出**: text — 比较通勤、氛围、适合人群，推荐

**Q48: Berkeley vs Seattle for a student**
- **预期路由**: COMPARE → F3
- **预期输出**: text — 比较生活成本、学校周边、交通

**Q49: Compare Berkeley and Seattle** (无优先级)
- **预期路由**: COMPARE → F4
- **预期输出**: text — 先问优先级 + suggestedReplies

---

#### F5: 价格 vs 通勤/条件取舍

| 属性 | 内容 |
|------|------|
| **Route Code** | `F5` |
| **Scenario** | `F5_price_condition_tradeoff` |

**Q50: Is saving $300 worth 20 extra minutes of commute?**
- **预期路由**: COMPARE → F5
- **预期输出**: text — 量化月节省 vs 通勤负担，给出实用建议

**Q51: What am I sacrificing by picking the cheaper one?**
- **预期路由**: COMPARE → F5 (含具体问题的比较)
- **预期输出**: text — 具体列出该房源的 tradeoff (amenities/位置/大小)

---

#### F6: 以当前房源为基准找更优替代项

| 属性 | 内容 |
|------|------|
| **Route Code** | `F6` |
| **Scenario** | `F6_better_alternatives` |
| **目标执行器** | `search` |

**Q52: Is there anything better than 2315 College in the same price range?**
- **预期路由**: SEARCH → F6
- **预期输出**: list 协议 — 同价位更优选项

---

#### F7: 从已展示房源中按优先级推荐最佳

| 属性 | 内容 |
|------|------|
| **Route Code** | `F7` |
| **Scenario** | `F7_pick_best_from_results` |
| **目标执行器** | `compare` |

**Q53: (有多个已展示房源) Which one should I pick? Budget is most important**
- **预期路由**: COMPARE → F7
- **预期输出**: text — 推荐最便宜/性价比最高的，说明理由

---

## 五、ACTION 大类 — 预约/申请

| 属性 | 内容 |
|------|------|
| **执行器** | `40_action_resolve_and_emit` (Python代码，含 Astra query + property lookup) |
| **输出协议** | action |
| **关键规则** | ANSWER-FIRST: 如果有实质性问题 (宠物/价格/设施/通勤...)，优先路由到 DETAIL/KNOWLEDGE/COMPARE，而非 ACTION |

---

#### D3: 明确房源预约看房

| 属性 | 内容 |
|------|------|
| **Route Code** | `D3` |
| **Scenario** | `D3_booking_known_property` |
| **前置条件** | 有明确房源 |
| **当前 AIChat 覆盖** | Phase5 (TOUR-001: schedule tour for 2315 College) |

**Q54: I want to schedule a tour for 2315 College Avenue**
- **预期路由**: ACTION → D3 → `40_action_resolve_and_emit`
- **预期输出**: action 协议 — tour booking 流程

**Q55: Book a tour for the Wyatt in Berkeley this Saturday**
- **预期路由**: ACTION → D3
- **预期输出**: action 协议

---

#### D4: 明确房源申请

| 属性 | 内容 |
|------|------|
| **Route Code** | `D4` |
| **Scenario** | `D4_application_known_property` |

**Q56: I want to apply for 2701 Durant Avenue**
- **预期路由**: ACTION → D4
- **预期输出**: action 协议 — application 流程

---

#### E2: 当前查看房源预约/申请

| 属性 | 内容 |
|------|------|
| **Route Code** | `E2` |
| **Scenario** | `E2_viewing_property_action` |
| **前置条件** | [Viewing property] 存在 |

**Q57: (正在查看某房源) Book it / Apply now**
- **预期路由**: ACTION → E2
- **预期输出**: action 协议

**Q58: (正在查看某房源) Can I tour this?**
- **预期路由**: ACTION → E2
- **预期输出**: action 协议

---

#### D5: 有预约/申请意图但无目标房源

| 属性 | 内容 |
|------|------|
| **Route Code** | `D5` |
| **Scenario** | `D5_action_without_property` |
| **目标** | ask_property |

**Q59: I want to schedule a tour** (无具体房源)
- **预期路由**: ACTION → D5
- **预期输出**: text — 问哪套房源 + suggestedReplies

---

#### ANSWER-FIRST 规则验证 (关键边界用例)

**Q60: (有预约意向但同时有实质问题) Can I tour 2315 College? Also, is it pet friendly?**
- **预期行为**: 路由 DETAIL (E1)，先回答 pet policy，NOT ACTION
- **原则**: 含实质问题 → 优先回答，不触发 action

**Q61: Does 2701 Durant allow cats? I want to apply**
- **预期行为**: 路由 DETAIL → E1，回答宠物政策后引导申请
- **原则**: 先回答后 action

---

## 六、KNOWLEDGE 大类 — 知识问答

| 属性 | 内容 |
|------|------|
| **执行器** | `50_knowledge_answerer` (LLM gpt-4.1-mini) → `50_knowledge_format_text` |
| **输出协议** | text (自然语言 + SUGGESTED_REPLIES + 引导搜索) |
| **当前 AIChat 覆盖** | Phase5 (COST-001~005, APPLY-001~004, TOUR-002~004) |

---

#### D1: 租房知识/术语/流程问答

| 属性 | 内容 |
|------|------|
| **Route Code** | `D1` |
| **Scenario** | `D1_rental_knowledge` |

**Q62: How much are utilities typically for a 1-bedroom in Berkeley? Electric, water, gas, internet**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 水电煤网分项估算 + suggestedReplies 引导搜索

**Q63: What is the security deposit usually?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 押金通常=1个月租金，可能有额外费用

**Q64: How do I apply for an apartment? Walk me through the process**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 分步流程 + suggestedReplies

**Q65: What documents do I need to apply? Pay stubs, bank statements?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 列出所需文件

**Q66: What are the lease terms? 6-month, 12-month, month-to-month?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 常见租期选项说明

**Q67: How long does approval usually take?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 审批时间估算

**Q68: What are typical pet deposits and monthly pet rent?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 宠物押金 + 月租估算

**Q69: What parking options are available and how much does parking cost?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 停车选项和费用

**Q70: Can I do a virtual tour instead of in-person?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 虚拟看房选项说明

**Q71: What should I bring to a tour? What questions should I ask the landlord?**
- **预期路由**: KNOWLEDGE → D1
- **预期输出**: text — 看房准备清单 + 建议问题

---

#### D2: 区域信息问答

| 属性 | 内容 |
|------|------|
| **Route Code** | `D2` |
| **Scenario** | `D2_area_info` |

**Q72: Which neighborhoods in Berkeley are safest with good walkability?**
- **预期路由**: KNOWLEDGE → D2
- **预期输出**: text — 介绍 Berkeley 安全街区 + 步行性 + suggestedReplies 引导搜索

**Q73: What is the vibe of Koreatown in LA?**
- **预期路由**: KNOWLEDGE → D2
- **预期输出**: text — 区域特色介绍 + 引导搜索

---

#### D6: 无关话题 (off-topic)

| 属性 | 内容 |
|------|------|
| **Route Code** | `D6` |
| **Scenario** | `D6_off_topic` |

**Q74: Tell me a joke**
- **预期路由**: KNOWLEDGE → D6
- **预期输出**: text — 礼貌拉回租房助手范围 + suggestedReplies 引导找房

**Q75: What's the weather like today?**
- **预期路由**: KNOWLEDGE → D6
- **预期输出**: text — 拉回 + 引导搜索房源

---

## 七、G_RELOCATION 大类 — 换房/续租

| 前置条件 | 有 current_residence_anchor |
|------|------|

---

#### G1: 以当前住所为圆心搜索更大房源

| 属性 | 内容 |
|------|------|
| **Route Code** | `G1` |
| **Scenario** | `G1_nearby_bigger` |
| **目标执行器** | `search` |

**Q76: (当前住 1BR) I need a bigger place nearby**
- **预期路由**: SEARCH → G1
- **预期提取**: `bedrooms >= current_bedrooms + 1`
- **预期输出**: list 协议，同区更大户型 + 解释 mapping 逻辑

---

#### G2: 同区搜索更低价选项

| 属性 | 内容 |
|------|------|
| **Route Code** | `G2` |
| **Scenario** | `G2_nearby_cheaper` |

**Q77: (当前住 $2500) Can I find something cheaper around here?**
- **预期路由**: SEARCH → G2
- **预期提取**: `max_price <= current_price`, 同区
- **预期输出**: list 协议 + 提示可能需要 tradeoff

---

#### G3: 想换房但无方向

| 属性 | 内容 |
|------|------|
| **Route Code** | `G3` |
| **Scenario** | `G3_move_direction_unclear` |
| **目标** | ask_direction |

**Q78: I want to move / 我想搬家**
- **预期路由**: FOLLOW_UP → G3
- **预期输出**: text — 问迁移动机: closer to work / cheaper / bigger / different area

---

#### G4: 当前住所+明确目标方向

| 属性 | 内容 |
|------|------|
| **Route Code** | `G4` |
| **Scenario** | `G4_relocate_to_clear_target` |

**Q79: (当前住 Berkeley) I want to move closer to downtown SF**
- **预期路由**: SEARCH → G4
- **预期提取**: `current_residence="Berkeley"`, `target_direction="closer_to_work"`, `location="downtown SF"`
- **预期输出**: list 协议，downtown SF 附近房源

---

#### G5: 合同到期时间+搜索替代房

| 属性 | 内容 |
|------|------|
| **Route Code** | `G5` |
| **Scenario** | `G5_lease_end_timing_search` |

**Q80: My lease ends in December, what can I find?**
- **预期路由**: SEARCH → G5
- **预期提取**: `move_in_date="December"`
- **预期输出**: list 协议，12月可入住房源

---

## 八、H_FALLBACK 大类 — 降级/异常处理

| Route Code | Scenario | 说明 |
|------|------|------|
| **H1** | `H1_zero_results_or_unclear` | 分类不清或结果异常，引导回找房 |
| **H2** | `H2_parse_error` | Router JSON 解析失败，可恢复提示 |
| **H3** | `H3_unsupported_recovery` | 能力暂不支持，引导可用功能 |

**Q81: (意图混乱时) asdfghjkl12345**
- **预期路由**: KNOWLEDGE → H1
- **预期输出**: text — 礼貌表示未理解，引导说明租房需求

---

## 九、语言检测 & 混合输入

| 属性 | 内容 |
|------|------|
| **支持语言** | en / zh / es / fr / ko / ja ... |
| **语言稳定性** | 短期 ok/yes/1 保留上轮语言 |
| **混合输入** | 按主导语言判定；地名/楼盘名不改变语言判定 |

**Q82: "Katy学区" apartments（中文地名在英语句中）**
- **预期路由**: 取决于搜索意图
- **预期语言**: `en` (主导语言为英文)
- **预期提取**: `location="Katy学区"` (proper noun 保留)

**Q83: "约tour The Wyatt"（中英混合）**
- **预期语言**: `zh` (主导语言为中文)
- **预期路由**: ACTION 相关 (如果有 Viewing property)

**Q84: 洛杉矶 2 bedroom apartment 预算两千五**
- **预期语言**: `zh` (主导语言中文)
- **预期路由**: SEARCH → A3
- **预期提取**: `location="洛杉矶"`, `bedrooms=2`, `max_price=2500` (两千五=2500)

---

## 十、预算解析专项用例

| # | 输入 | min_price | max_price | 说明 |
|---|------|-----------|-----------|------|
| Q85 | `$2000/mo~2500/mo` | 2000 | 2500 | 范围 → 两个边界 |
| Q86 | `under $2500` | -1 | 2500 | ceiling only |
| Q87 | `at least $1500` | 1500 | -1 | floor only |
| Q88 | `around $2000` | 1600 | 2400 | ≈ → 0.8x~1.2x band |
| Q89 | `$1800+` | 1800 | -1 | + → floor |
| Q90 | `2k–2.5k` | 2000 | 2500 | k 展开 |
| Q91 | `between 1400 and 2700` | 1400 | 2700 | 范围 |
| Q92 | `两千到两千五` | 2000 | 2500 | 中文数字 |
| Q93 | `$2000` (bare) | -1 | 2000 | 裸数字 → ceiling |

---

## 十一、多轮对话上下文验证

验证 `conversation_history` + `brief_*` 变量在多轮中的累积行为：

**Multi-Turn Scenario A: 渐进缩小范围**

| Turn | Query | 预期 Route | 预期行为 |
|------|-------|-----------|---------|
| 1 | "Show me apartments in Berkeley" | B1 | 展示 Berkeley 所有房源 |
| 2 | "Only 2 bedrooms" | E3 | 在当前结果中过滤 2BR |
| 3 | "Under $2500" | E3 | 继续过滤 ≤$2500 |
| 4 | "Pet friendly ones" | E3 | 继续过滤 pet_friendly |

**Multi-Turn Scenario B: 纠错 & 方向改变**

| Turn | Query | 预期 Route | 预期行为 |
|------|-------|-----------|---------|
| 1 | "Apartments in Los Angeles" | B1 | 展示 LA 房源 |
| 2 | "Actually, I want Berkeley" | A? / B1 | 切换到 Berkeley |
| 3 | "Remove the budget filter" | E3 | 去掉预算维度 |
| 4 | "Studio only" | E3 | 过滤 studio |

**Multi-Turn Scenario C: 上下文记忆**

| Turn | Query | 预期 Route | 预期行为 |
|------|-------|-----------|---------|
| 1 | "2BR in Berkeley under $3000" | A3 | 搜索 Berkeley 2BR ≤$3000 |
| 2 | "What about parking?" | E3 或 E1 | 在当前结果中添加 parking 过滤或查当前房源的停车 |

---

## 十二、与现有 AIChat 用例映射

| 现有用例文件 | 覆盖场景 | 本文档对应 |
|-------------|---------|-----------|
| **Phase1-Homepage** | 首页 + Composer 组件 | — (UI 层，非 workflow) |
| **Phase2-Search** | 基础查询 (TEST-001~004, EXTRA) | A7, B1, A3, A6 |
| **Phase3-Multiturn** | 多轮连续性 (4 sessions) | 第十一节 |
| **Phase4-Composer** | 下拉框组合 (TC-C01~C06) | — (UI 层) |
| **Phase5-CostTour** | 费用/申请/看房 (15 queries) | D1, D3/D4, F5, D1 |

---

## 十三、建议新增的测试优先级

| 优先级 | 场景 | 原因 |
|--------|------|------|
| **P0** | A1 全维度搜索 | 最常见路径 |
| **P0** | B1 仅城市搜索 | 入口级路径 |
| **P0** | C1~C6 追问定位 | 用户不完整输入的兜底 |
| **P0** | E1 查看房源 QA | 核心转化路径 |
| **P1** | D3/D4 Action 流程 | 核心转化 |
| **P1** | ANSWER-FIRST 边界 (Q60/Q61) | 防止错误路由到 action |
| **P1** | 多轮上下文累积 | 复杂用户行为 |
| **P2** | G1~G5 换房场景 | 差异化功能 |
| **P2** | F1~F7 比较分析 | 增值功能 |
| **P2** | H1~H3 异常降级 | 鲁棒性 |
| **P3** | 语言混合输入 | 边缘 case |
| **P3** | 预算解析 (Q85~Q93) | 精确性验证 |
