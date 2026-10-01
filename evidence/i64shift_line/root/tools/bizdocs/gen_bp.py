#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cheng x UniMaker 商业计划书 (A4, 对外版) - 与路演叙事一致。"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import Color, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, NextPageTemplate,
)

OUT = "/Users/lbcheng/cheng-lang/output/pdf/Cheng-UniMaker商业计划书.pdf"
W, H = A4

pdfmetrics.registerFont(TTFont("Hei", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=1))
pdfmetrics.registerFont(TTFont("HeiL", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=1))

INK    = HexColor("#1A1C24")
NIGHT  = HexColor("#14161F")
GOLD   = HexColor("#B88C29")
GOLD_D = HexColor("#8A6A1F")
INDIGO = HexColor("#293869")
MUTED  = HexColor("#52545E")
FAINT  = HexColor("#7B7D86")
LINE   = HexColor("#DBD9D2")
PAPER  = HexColor("#FAF9F6")
CARDBG = HexColor("#F4F3EE")

def st(name, **kw):
    base = dict(fontName="HeiL", fontSize=10.5, leading=17, textColor=INK,
                alignment=TA_LEFT, wordWrap="CJK", spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

S_H1     = st("h1", fontName="Hei", fontSize=17, leading=24, textColor=INDIGO,
              spaceBefore=16, spaceAfter=8)
S_H2     = st("h2", fontName="Hei", fontSize=12.5, leading=18, textColor=INK,
              spaceBefore=10, spaceAfter=4)
S_BODY   = st("body")
S_BULLET = st("bullet", leftIndent=14, firstLineIndent=0, spaceAfter=4)
S_NOTE   = st("note", fontSize=9, leading=14, textColor=MUTED)
S_TCELL  = st("tcell", fontSize=9.5, leading=14, spaceAfter=0)
S_TCELLB = st("tcellb", fontName="Hei", fontSize=9.5, leading=14, spaceAfter=0)

def P(text, style=S_BODY):
    return Paragraph(text, style)

def bullet(text):
    return Paragraph("<font color='#B88C29'>■</font>  " + text, S_BULLET)

def table(rows, widths, header=True, cell_style=S_TCELL, head_style=S_TCELLB):
    data = []
    for i, row in enumerate(rows):
        stl = head_style if (header and i == 0) else cell_style
        data.append([Paragraph(cell, stl) for cell in row])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LINEBELOW", (0,0), (-1,-2), 0.5, LINE),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]
    if header:
        cmds += [
            ("BACKGROUND", (0,0), (-1,0), CARDBG),
            ("LINEBELOW", (0,0), (-1,0), 1, GOLD),
        ]
    t.setStyle(TableStyle(cmds))
    return t

MARGIN = 20*mm

def on_page(canv, doc):
    canv.saveState()
    canv.setFillColor(PAPER)
    canv.rect(0, 0, W, H, fill=1, stroke=0)
    canv.setFillColor(GOLD)
    canv.rect(0, H-6, W, 6, fill=1, stroke=0)
    canv.setFillColor(FAINT); canv.setFont("HeiL", 8.5)
    canv.drawString(MARGIN, 12*mm, "Cheng x UniMaker  ·  商业计划书  ·  2026-07")
    canv.drawRightString(W-MARGIN, 12*mm, "%d" % doc.page)
    canv.setStrokeColor(LINE); canv.setLineWidth(0.6)
    canv.line(MARGIN, 16*mm, W-MARGIN, 16*mm)
    canv.restoreState()

def on_cover(canv, doc):
    canv.saveState()
    canv.setFillColor(NIGHT); canv.rect(0, 0, W, H, fill=1, stroke=0)
    canv.setFillColor(GOLD); canv.rect(0, 0, 8, H, fill=1, stroke=0)
    canv.setFillColor(Color(1,1,1)); canv.setFont("Hei", 15)
    canv.drawString(24*mm, H-42*mm, "Cheng   x   UniMaker")
    canv.setFillColor(HexColor("#EDE3C8")); canv.setFont("HeiL", 11)
    canv.drawString(24*mm, H-50*mm, "把创造力、所有权与智能, 还给每一个人")
    canv.setFillColor(Color(0.98,0.98,0.98)); canv.setFont("Hei", 30)
    canv.drawString(24*mm, H-84*mm, "商业计划书")
    canv.setFont("Hei", 15)
    canv.drawString(24*mm, H-97*mm, "自主语言 · 发布入口 · 价值结算 · 智能体网络")
    canv.setFillColor(HexColor("#C7CBDB")); canv.setFont("HeiL", 10.5)
    ty = H-115*mm
    for ln in [
        "Cheng 是一门完成自举闭环的系统级编程语言; UniMaker 是建立其上的跨端发布入口,",
        "服务创作者、电商厂家与消费者三类人群, 覆盖创作、生意与生活。",
        "一次发布, 处处可用, 数据归己, 智能涌现。",
    ]:
        canv.drawString(24*mm, ty, ln); ty -= 6.5*mm
    canv.setFillColor(FAINT); canv.setFont("HeiL", 9.5)
    canv.drawString(24*mm, 28*mm, "版本: 2026-07-15    ·    机密文件, 仅供定向阅读")
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=18*mm, bottomMargin=22*mm)
frame = Frame(MARGIN, 22*mm, W-2*MARGIN, H-40*mm, id="main")
cover_frame = Frame(MARGIN, 22*mm, W-2*MARGIN, H-44*mm, id="cover")
doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover),
    PageTemplate(id="Main", frames=[frame], onPage=on_page),
])

CW = W - 2*MARGIN
E = []

E.append(NextPageTemplate("Main"))
E.append(Spacer(1, 1))
E.append(PageBreak())

# ---------- 一、执行摘要 ----------
E.append(P("一、执行摘要", S_H1))
E.append(P(
    "Cheng 是一门从零自举的系统级编程语言: 种子编译器到 Stage1、Stage2、Stage3 的完整自举链已经跑通, "
    "不动点哈希锁定为 e202c0c35424eb36, 回归门禁 ci_gate 全部 35 项通过, 生产回归套件 1346/1348 (99.85%)。"
    "它的目标是比 C 更快、比 Rust 和 Swift 更简单、原生支持多端后端代码生成, 并且从设计起点就对 AI 生成友好。"))
E.append(P(
    "UniMaker 是建立在 Cheng 之上的跨端发布入口。用户做一次内容、商品或生活服务, 一次发布之后, "
    "手机、电脑等各端都能像原生应用一样秒开。真机实测: 端到端视频发布 944 毫秒内可见, "
    "内容命中后再次打开为 0 毫秒级, 首次连接握手 560 毫秒, 安卓与鸿蒙双端交叉验证通过。"))
E.append(P(
    "我们的核心判断是: AI 已经把一支团队的产能交给了个人, 但工具链、分发渠道、数据与智能仍然握在平台手里, "
    "个人和商家只能按月租用。我们要补上缺失的那一半 -- 做得出来, 发得出去, 卖得掉, 数据留在自己手里, "
    "智能从自己的数据里长出来。服务对象不只是创作者: 创作者是冷启动入口, 电商厂家是供给与货架, "
    "消费者是规模与飞轮, 三类人共用同一条自主链, 覆盖衣食住行。"))

# ---------- 二、问题与机会 ----------
E.append(P("二、问题与机会: 人、货、场都被三堵墙挡住", S_H1))
E.append(P("平台墙", S_H2))
E.append(P(
    "创作者把内容做完了, 却常常发不出去、也难被看见: 审核、限流、封号全都捏在别人手里。"
    "厂家要卖货, 只能去电商或短视频平台付费占位, 货架和进店的客人都是租来的; 平台规则一变、流量一断, 生意就悬。"
    "消费者则被锁在一个个封闭应用里, 换个设备就要重装、重新登录、从头再来。"))
E.append(P("体验墙", S_H2))
E.append(P(
    "慢、卡、反复跳转已经成了所有人默认要付的成本。脚本引擎、虚拟机、GC 停顿、跨语言桥接是移动端体验的隐性性能税。"
    "用户一不耐烦就走了, 可创作者与商家却说不清问题到底出在哪一层: 是自己的产品做得不好, 还是宿主应用太重, "
    "还是平台又悄悄改了规则。"))
E.append(P("数据墙", S_H2))
E.append(P(
    "用户创造的内容、成交的订单、每天买吃住行留下的行为, 都被平台收走去训练它们的模型。"
    "能力与钱不断流向中心机房, 很少再回到个人或商家手里。没有数据主权, 后面的智能与收益就都无从谈起。"))
E.append(P("机会", S_H2))
E.append(P(
    "一门从设计上保证内存确定性(无 GC 停顿)、自举验证(编译器可自证正确)的语言, 配上一个把多端发布做成一次点击的入口, "
    "AI 生成的代码加上这套底座, 能让个体创作者和小商家获得过去需要中大型团队才能做到的原生多端性能与分发效率。"
    "这不是更好用的 Flutter, 而是从语言层重新定义「一次编写、原生多端、AI 友好」的组合。"))

# ---------- 三、目标用户 ----------
E.append(P("三、目标用户: 三类人, 同一条链", S_H1))
E.append(table([
    ["人群", "在链条中的角色", "拿到什么"],
    ["创作者", "冷启动入口",
     "一次做内容与应用, 多端秒发秒开; 作品、数据与收益默认归己, 不靠租用平台账号体系存活。"],
    ["电商厂家", "供给与货架",
     "商品即应用: 详情、试用、售后、私域自建; 支持单个上架与批量导入, 不再付费租别人的货架与流量。"],
    ["消费者", "规模与飞轮",
     "各端原生体验; 买、吃、住、行的生活数据留在自己设备上, 长出只属于自己的智能助手。"],
], [24*mm, 34*mm, CW-58*mm]))
E.append(P(
    "创作者最愿意尝新, 用于完成冷启动; 但市场天花板不是创作者, 而是每个人的生活与每一门生意。", S_NOTE))

# ---------- 四、产品与技术 ----------
E.append(P("四、产品与技术", S_H1))
E.append(P("4.1 Cheng: 系统级语言底座", S_H2))
E.append(bullet("自举闭环: 种子编译器 → Stage1 → Stage2 → Stage3, 不动点 e202c0c35424eb36 锁定。"
                "编译器用自己的语言编译自己且结果确定性收敛, 是编译器工程里验证「设计自洽、无隐藏缺陷」的最硬指标之一。"))
E.append(bullet("回归门禁: ci_gate 35 项全部通过(含确定性重复编译一致性、字节级产物对比、自举不动点校验); "
                "生产回归 1346/1348 (99.85%)。"))
E.append(bullet("多端后端: ARM64 后端代码生成在安卓与鸿蒙真机验证; 自研网络协议栈(QUIC/TLS1.3、VPN 传输层)"
                "与加密实现(RSA-PSS、ECDSA、ChaCha20-Poly1305), 不依赖第三方加密与网络库。"))
E.append(bullet("性能: 自举保真度实测 0.78 倍, Cheng 编译产物在该类任务上快于 C 种子编译器; "
                "增量编译已上线, 实测提速 5%-23%; 体验持续逼近业界最快一档。"))
E.append(P("4.2 UniMaker: 面向三类人群的发布入口", S_H2))
E.append(table([
    ["实测指标", "数值", "说明"],
    ["发布到可见", "944ms", "端到端视频发布链路, 达到「发布到可见 ≤1 秒」目标"],
    ["再次打开", "0ms 级", "安卓真机双进程, hash 命中即秒开"],
    ["首次连接", "560ms", "TLS 握手证书签名从 RSA-PSS 换 ECDSA, 由 860ms 优化而来"],
    ["跨端验证", "双端通过", "安卓与鸿蒙真机互发内容、互相播放交叉验证"],
], [30*mm, 24*mm, CW-54*mm]))
E.append(bullet("发布类型覆盖创作(视频、图文、影音、直播)、商家货架(单个上架与 CSV 批量导入)与生活服务(餐饮、出行、二手), "
                "发布入口按三类人群分组呈现。"))
E.append(bullet("React 生态迁移: React → Cheng 转译器已覆盖主流组件与事件模型, 存量 Web/React 应用可低成本迁入, "
                "不必推倒重来。"))
E.append(bullet("自研 VPN 与点对点分发已在安卓真机跑通, 内容只传输真正变化的部分, 重复内容自动去重。"))

# ---------- 五、技术护城河 ----------
E.append(P("五、技术护城河", S_H1))
E.append(P("真正难复制的不是单点功能, 而是四件事叠加:"))
E.append(bullet("自举编译器本身即护城河: 能把编译器完全用该语言自己重写并稳定收敛, 多数新语言项目止步于"
                "「用 Rust/C++ 写个还不错的编译器」, 很少走到「能自己编译自己且确定性收敛」。"))
E.append(bullet("全栈自研网络与加密: QUIC/TLS1.3、VPN、RSA/ECDSA/ChaCha20 全部自研, 性能可下探到算法内部"
                "(签名算法与点乘算法替换, 实测握手 482ms → 424ms), 不受任何第三方库断供或改协议影响。"))
E.append(bullet("AI 多智能体研发范式: 一名核心决策者把关架构, 多条并行 AI 攻坚线用共享验证工具链"
                "(census、exec_diff、ci_gate)交叉校验。该体系已在百万行级代码库的自举正确性上跑通, 是小团队替代人海战术的组织资产。"))
E.append(bullet("Fusion 工具链: CSG 结构化查询、崩溃分诊、字节级产物对比、符号回归检测 -- 自举语言没有现成 LLVM/GDB 生态, "
                "这套自建基础设施本身构成后来者的时间壁垒。"))

# ---------- 六、知识产权与开源策略 ----------
E.append(P("六、知识产权与开源策略", S_H1))
E.append(P(
    "第一批 5 件发明专利已通过专利代理机构初审并提交申请, 全部落在结算与验证协议层(Vexa/CSG-Core):"))
E.append(table([
    ["#", "专利方向", "保护的能力"],
    ["1", "确定性事实图二进制编码(CSGC)与根哈希", "同一资产事实只能生成唯一 facts_root, 截断、篡改、不完整语义直接阻断"],
    ["2", "预言机观察 → 确定性资产事实", "外部数据进入结算层的准入规范: 可信签名者注册表、quorum 与 TTL 规则"],
    ["3", "事实根/计划根/证明哈希/执行回执编排", "AI 计划绑定确定输入, 执行结果可复验、可审计"],
    ["4", "可恢复状态单元与恢复根绑定", "系统崩溃或迁移后可验证恢复, 反重放、去重"],
    ["5", "AI 候选与确定性事实门禁对齐", "AI 生成的资产候选必须过确定性门禁才可进入生产"],
], [8*mm, 58*mm, CW-66*mm]))
E.append(P("与开源的关系", S_H2))
E.append(P(
    "开源与专利分层, 互不冲突: 语言层(Cheng 编译器与工具链)完全开源, 用开放换取开发者信任与生态, 这是获客面; "
    "专利护的是协议层(结算、验证、准入规则), 恰好是商业模式中产生抽成收入的经济层与智能体层的规则基础, 这是变现面。"
    "专利定位为防御性使用: 不向开源使用者收费, 而是防止大厂复制结算协议后反过来用专利压制 -- 护协议, 不护语言。"))

# ---------- 七、市场与竞品 ----------
E.append(P("七、市场与竞品", S_H1))
E.append(P("语言层", S_H2))
E.append(P(
    "Rust 安全性强但学习曲线陡峭; Zig 简洁但许多任务仍依赖 C 工具链; Swift 与苹果生态强绑定。"
    "Cheng 的差异化不在语法, 而在「多端后端 + 自举验证 + AI 生成友好」三者从设计起点就叠加, 目前没有直接对标者。"))
E.append(P("应用制作与发布层", S_H2))
E.append(P(
    "小程序框架分发效率高但锁定单一平台、性能受限于宿主 JS 引擎; Flutter 跨端体验好但属于渲染引擎抹平差异, "
    "并非原生代码生成; Bolt/v0 等 AI 应用生成器产出 Web/React 代码, 仍要套一层传统跨端框架, 不解决底层性能。"
    "UniMaker 的定位是: AI 生成的产出直接编译成多端原生代码。「AI 生成效率 + 原生性能 + 多端分发」三者同时具备, "
    "目前市场上没有直接对标产品。"))

# ---------- 八、商业模式 ----------
E.append(P("八、商业模式: 与四层技术栈一一对应", S_H1))
E.append(table([
    ["层", "模式", "说明"],
    ["语言层", "完全开源", "语言不收费, 用开放换信任与生态; 协议层由已提交的发明专利防御性护航。"],
    ["入口层", "订阅 + 企业版", "个人订阅(发布额度、高级模板、构建加速分层)带来日常现金流; 厂家与企业私有部署、性能 SLA 与优先支持贡献大客单价。"],
    ["经济层", "网络服务抽成", "走网络的算力与分发按量抽成; 完全本地使用永久免费, 不绑架用户。"],
    ["智能体层", "交易抽成", "个人助手之间买卖知识、技能与算力时收取网络服务费; 规模越大, 飞轮越快。"],
], [22*mm, 32*mm, CW-54*mm]))
E.append(P(
    "路径为「订阅制 + 企业版 + 生态分成」组合: 语言开源建立社区信任(参考 Rust/Zig 路径), "
    "收入来自 UniMaker 及其上层网络 -- 个人订阅满足现金流, 企业私有部署满足大客单价, "
    "模板与插件市场分成作为生态成熟后的长尾收入。"))

# ---------- 九、路线图 ----------
E.append(P("九、路线图", S_H1))
E.append(table([
    ["阶段", "内容", "状态"],
    ["点火(自举闭环)", "种子编译器 → Stage1/2/3 自举不动点", "已完成; 不动点锁定, ci_gate 35/35"],
    ["UniMaker 核心链路", "秒发秒开、跨端真机验证", "已达标; 安卓与鸿蒙双端实测通过"],
    ["性能攻坚(beat-C)", "编译与运行体验持续逼近业界最快一档", "推进中; 增量编译已上线, 提速 5%-23%"],
    ["React 迁移", "存量 Web/React 应用迁移到 Cheng 原生跨端", "推进中; 主流组件与事件模型已覆盖"],
    ["公测", "面向创作者与商家开放, 验证订阅转化", "筹备中"],
    ["经济飞轮", "算力与分发按量计费, 作者与商家收益自动闭环", "规划中"],
    ["智能体网络", "个人助手互联, 能力交易, 集体智能涌现", "规划中"],
], [34*mm, 62*mm, CW-96*mm]))

# ---------- 十、团队与研发体系 ----------
E.append(P("十、团队与研发体系", S_H1))
E.append(P(
    "当前研发采用小规模团队 + AI 多智能体协同: 一名核心决策者把关架构与正确性标准, 多条并行 AI 攻坚线分别负责性能、"
    "正确性与产品功能, 通过共享的自动化验证工具链(回归门禁、字节级产物对比、崩溃分诊)交叉校验。"
    "该体系已在百万行级代码库的自举正确性维护上跑通, 用工具链的确定性替代人海战术, 是本项目的核心方法论资产。"))
E.append(P(
    "融资后的扩张方向: 补充编译器后端方向的专业工程能力, 以及产品与增长人才, 分别服务性能攻坚与公测商业化两条主线。"))

# ---------- 十一、融资用途 ----------
E.append(P("十一、融资用途", S_H1))
E.append(P("按优先级:", S_H2))
E.append(bullet("性能攻坚团队: 招募编译器后端/寄存器分配方向工程能力, 把编译与运行体验推进到业界最快一档 -- "
                "这是产品可信度的技术前提。"))
E.append(bullet("UniMaker 产品化与公测: 完成功能对齐、建立公测监控与反馈闭环, 验证订阅转化。"))
E.append(bullet("安全审计: 自研加密与网络协议栈交由第三方安全审计, 建立企业客户信任。"))
E.append(bullet("生态与开发者关系: 语言开源后的社区运营、文档与开发者布道, 为长期生态积累铺垫。"))

# ---------- 十二、风险与对策 ----------
E.append(P("十二、风险与对策", S_H1))
E.append(table([
    ["风险", "对策"],
    ["性能攻坚周期不确定",
     "聚焦已验证有效的方向(增量编译、结构性算法降阶), 每一步以回归门禁背书, 不为进度跳过验证。"],
    ["新语言 + 新入口双重冷启动",
     "先以技术硬指标(自举、性能)吸引系统程序员社区背书, 再以秒发秒开场景触达创作者与商家; 两条获客路径独立验证、互相导流。"],
    ["自研安全栈的审计要求",
     "公测前完成第三方安全审计, 审计通过后才进入生产环境。"],
    ["商业转化节奏",
     "公测阶段优先验证免费到付费的转化率与留存, 数据达标后再扩大企业销售投入。"],
], [44*mm, CW-44*mm]))

doc.build(E)
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
