---
name: morph-ppt
description: Generate Morph-animated PPTs with officecli
---

# Morph

Generate PPTs with officecli. Key features:

- **Morph Animation**: Smooth transitions between slides with automatic shape-matching animation
- **Flexible Design**: Freely design around the topic, with multiple style references available
- **Quick Generation**: User provides a topic, Agent infers audience/purpose/narrative and generates automatically
---

## Use when
- User wants to generate a `.pptx`

---

## Workflow

**Execution Rules**:
- Once Phase 2 (Planning) begins, proceed sequentially through Phase 2 → 3 → 4 until a complete PPT is delivered
- Do not pause midway to ask "should I continue?" or "should I move to the next step?"
- Unless the user actively interrupts or requests a stop, execute all the way through
- Output files from each phase are saved automatically; the user can check progress at any time
- **Remind the user**: Do NOT open the .pptx file while generation is in progress — officecli cannot write to a file that is open in PowerPoint/WPS
- **Language**: Generate all PPT content (titles, text, descriptions) in the same language the user used in their request

### Phase 1: User Interaction

**Ask (only when the topic is unclear)**

**Decision Criteria**:
- No need to ask: "Make a PPT introducing the AionUi product" (topic is clear)
- No need to ask: "Company annual report" (topic is clear)
- Must ask: "Help me make a PPT" (no topic at all)
- Must ask: "Make a presentation" (topic is unclear)

**Ask the user**:
```
What is the topic of the PPT?

It would be even better if you could provide the following (optional):
- Target audience and purpose
- Preferred visual style or color scheme
- Key content or reference materials

If not provided, I will infer these automatically based on the topic.
```

---

### Phase 2: Planning (Planner)

**Role**: PPT Planner who thinks deeply and produces high-quality plans.

**Reference Docs**: `reference/decision-rules.md`

**2.1 Extract and Infer**
- Extract from user input: topic, audience, purpose, style preferences, key content, background materials
- Infer missing information: audience, purpose, narrative structure, design references

**2.2 Share Understanding (present, then continue)**
- Share the extraction and inference results with the user, labeling each source (provided / inferred)
- Invite corrections, but **do not wait for the user to reply** -- proceed directly with subsequent steps
- If the user corrects something midway, adjust accordingly

**2.3 Research (optional, if tools are available)**
- If the topic requires supplementary data/cases and web/search tools are available, search for additional material
- Examples: market data, competitor information, industry cases, technical metrics, etc.
- **If no search tools are available**, skip this step and plan based on existing information

**2.4 Build Outline**
- Use the Pyramid Principle and a 6-step thinking process to determine the number of slides and the core message of each
- See `reference/decision-rules.md`, section "Outline Construction Principles"
- **Output to `outline.md` file**

**2.5 Generate Page Brief**

Generate a detailed design guide for each slide, answering 6 questions:

**Simplified example** (slide 3):
```
S3 [pillars] 三大核心能力
├─ 页面目标：让观众理解平台的三大能力差异化
├─ 核心信息（详细）：
│   ① 感知能力：支持文字、图片、语音、视频等多模态输入，识别准确率达 95%+
│   ② 推理能力：采用链式思考技术，复杂任务推理准确率提升 40%
│   ③ 执行能力：自动调用 20+ 外部工具和 API，完成端到端任务
├─ 证据支撑：各能力的具体指标和对比数据
├─ 页面类型：pillars（三列并排）
├─ 信息层级：编号最大 → 能力名次之 → 描述最小
└─ 过渡关系：S2 提出"为什么需要" → S3 回答"怎么做到"
```

**Key points**:
- Core information must be detailed and complete (including titles, descriptions, data, cases) -- the Design Expert will use it directly
- Do not write brief bullet points like "multimodal understanding"
- Do write full descriptions like "Supports text, image, voice, and video multimodal input with recognition accuracy above 95%"
- See `reference/decision-rules.md`, section "Page Brief Construction"
- **Output to `brief.md` file**

---

### Phase 3: PPT Generation (Design Expert)

**Role**: officecli Design Expert who masters all capabilities -- design, layout, animation, and shapes.

**Reference Docs**:
- `reference/pptx-design.md` - Coordinate system, fonts, spacing, Morph constraints, slide types
- `reference/officecli-pptx-min.md` - Command syntax
- `reference/styles/<style-name>/style.md` - Design reference examples (optional, includes build.sh build script)

**Generation Requirements**:
- Generate slide by slide following the Page Brief, ensuring comfortable layout
- Comply with the coordinate system, font, and Actor system specifications

**Morph Core Mechanism (signature feature of this skill)**:
1. **Slide 1 defines all scene actors** (6-8 fixed names, e.g., `!!dot-main`, `!!line-top`)
2. **Subsequent slides modify these actors' properties** (position, size, rotation, color)
3. **Actors not needed on a slide are moved off-screen** (ghost: `x=36cm`)
4. **All slides 2+ must set `transition=morph`**
5. **Adjacent slides should have noticeably different spatial compositions** (avoid monotony, create rhythm)

See `reference/pptx-design.md`, section "Scene Actor Design Rules"

**Output Artifacts**:
- `<topic-name>.pptx` - The generated PPT file (named after the topic, e.g., `AionUi-Intro.pptx`)
- Build script - A re-runnable script (containing all officecli commands)
  - **Default: `build.sh`** (Bash script, for macOS/Linux/WSL)
  - Other formats if needed: `build.py` (Python), `build.ps1` (PowerShell), etc.

---

### Phase 4: Quality Check (Quality Reviewer)

**Role**: Quality Reviewer who inspects quality and guides fixes.

**Reference Docs**: `reference/quality-gates.md`

**Check & Fix Flow**:

1. **Run automated checks**
   - `officecli validate <filename>.pptx` (syntax check)
   - `officecli view outline <filename>.pptx` (structure check)
   - Content gates, layout gates, Morph gates (refer to quality-gates.md)

2. **Issue found -> auto-fix**
   - Refer to the "Common Issues and Fixes" table in quality-gates.md
   - Modify the corresponding officecli commands and regenerate
   - Update the build script

3. **Re-check after fixing**
   - Re-run validate and outline
   - Verify that the issues are resolved

4. **Fix round limit**
   - Maximum 2 fix rounds
   - If still failing after 2 rounds -> record issues in `quality-report.md` and notify the user

5. **Output quality report**
   - All check results (pass / fail)
   - Fix log (what was fixed)
   - Remaining issues (if any) and recommendations

**Final Deliverables**:
- `<topic-name>.pptx` - PPT file (named after the topic)
- Build script - A re-runnable script (any language: Bash, Python, Node.js, PowerShell, etc.)
- `outline.md` - Overall plan
- `brief.md` - Detailed per-slide plan
- `quality-report.md` - Quality check report

---

### Phase 5: Iteration (Ongoing)

After delivering the PPT, **ask the user**:
- Is there anything you are not satisfied with?
- Would you like to adjust content, design, color scheme, or layout?

**Supports quick adjustments**:
- Change style/color scheme
- Edit a specific slide's content
- Adjust structure/order
- Add or remove slides

Wait for user feedback and respond promptly.

---

## Hard Constraints

1. The topic must be clear; if it cannot be extracted, ask the user to clarify (Phase 1)
2. The Planner must share the understanding results, distinguishing between provided and inferred information (Phase 2.2)
3. The Planner uses `decision-rules.md` to infer missing information (Phase 2.1)
4. The Design Expert must comply with all specifications in `pptx-design.md` (Phase 3)
5. The Quality Reviewer must comply with all gates in `quality-gates.md` (Phase 4)
6. Before delivery, `validate` + `view outline` must pass (Phase 4)

---

## Reference Docs (Three Roles)

### Planner (Phase 2)
- `reference/decision-rules.md` - Inference, Pyramid Principle, Outline construction, Page Brief

### Design Expert (Phase 3)
- `reference/pptx-design.md` - Coordinate system, fonts, Actor system, Morph constraints, slide types
- `reference/officecli-pptx-min.md` - officecli command syntax
- `reference/styles/<style-name>/style.md` - Design reference examples (includes build.sh)

### Quality Reviewer (Phase 4)
- `reference/quality-gates.md` - Quality gates + fix guidance

---

Good luck!
