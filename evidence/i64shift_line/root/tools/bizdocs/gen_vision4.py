#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cheng x UniMaker 愿景路演 v5 (16:9) - Fable 5 全文重写: 完整白话叙事, 受众三角贯穿全篇。"""
import os
import shutil
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT = "/Users/lbcheng/cheng-lang/output/pdf/Cheng-UniMaker-Vision-2026.pdf"
OUT_CN = "/Users/lbcheng/cheng-lang/output/pdf/Cheng-UniMaker路演.pdf"
W, H = 960.0, 540.0

pdfmetrics.registerFont(TTFont("Hei", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=1))
pdfmetrics.registerFont(TTFont("HeiL", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=1))
BOLD, BODY = "Hei", "HeiL"

INK    = Color(0.10, 0.11, 0.14)
NIGHT  = Color(0.08, 0.09, 0.13)
PAPER  = Color(0.980, 0.976, 0.966)
CARD   = Color(1, 1, 1)
INDIGO = Color(0.16, 0.22, 0.42)
GOLD   = Color(0.72, 0.55, 0.16)
GOLD_L = Color(0.94, 0.89, 0.76)
IND_L  = Color(0.86, 0.88, 0.94)
ZHU    = Color(0.70, 0.23, 0.18)
ZHU_L  = Color(0.96, 0.90, 0.88)
TEAL   = Color(0.13, 0.38, 0.39)
TEAL_L = Color(0.85, 0.92, 0.92)
MUTED  = Color(0.32, 0.33, 0.38)
FAINT  = Color(0.48, 0.49, 0.54)
LINE   = Color(0.86, 0.85, 0.82)

c = canvas.Canvas(OUT, pagesize=(W, H))
CJK_PUNC = "，。、；：？！（）「」『』【】·—…％"
def toks(s):
    out, buf = [], ""
    for ch in s:
        if ch == " ":
            if buf: out.append(buf); buf = ""
            out.append(" ")
        elif ("\u4e00" <= ch <= "\u9fff") or ch in CJK_PUNC:
            if buf: out.append(buf); buf = ""
            out.append(ch)
        else:
            buf += ch
    if buf: out.append(buf)
    return out
def wrap(s, font, size, maxw):
    lines, line = [], ""
    for t in toks(s):
        cand = line + t
        if pdfmetrics.stringWidth(cand, font, size) > maxw and line:
            lines.append(line.rstrip()); line = "" if t == " " else t
        else:
            if not (t == " " and line == ""): line = cand
    if line: lines.append(line.rstrip())
    return lines
def para(x, y, s, font=BODY, size=16, leading=None, color=INK, maxw=560, align="l"):
    leading = leading or size * 1.55
    c.setFillColor(color); c.setFont(font, size)
    for ln in wrap(s, font, size, maxw):
        if align == "c": c.drawCentredString(x, y, ln)
        elif align == "r": c.drawRightString(x, y, ln)
        else: c.drawString(x, y, ln)
        y -= leading
    return y
def bg(color=PAPER):
    c.setFillColor(color); c.rect(0, 0, W, H, fill=1, stroke=0)
def header(kicker, title, n, kc=GOLD):
    c.setFillColor(kc); c.rect(56, H-86, 42, 7, fill=1, stroke=0)
    c.setFillColor(kc); c.setFont(BOLD, 16); c.drawString(56, H-70, kicker)
    c.setFillColor(INK); c.setFont(BOLD, 33); c.drawString(56, H-112, title)
    footer(n)
def footer(n):
    c.setFillColor(FAINT); c.setFont(BODY, 16)
    c.drawString(56, 24, "Cheng x UniMaker   |   愿景路演   |   2026")
    c.drawRightString(W-56, 24, "%02d" % n)
    c.setStrokeColor(LINE); c.setLineWidth(0.7); c.line(56, 48, W-56, 48)
def chip(x, y, text, fg, bgc, pad=9, size=16):
    w = pdfmetrics.stringWidth(text, BOLD, size)+pad*2
    c.setFillColor(bgc); c.roundRect(x, y, w, size+12, 5, fill=1, stroke=0)
    c.setFillColor(fg); c.setFont(BOLD, size); c.drawString(x+pad, y+6, text)
    return w
def card(x, y, w, h, fill=CARD, r=10, border=None):
    if border: c.setStrokeColor(border); c.setLineWidth(1)
    c.setFillColor(fill); c.roundRect(x, y, w, h, r, fill=1, stroke=1 if border else 0)

# ---------- 01 封面 ----------
bg(NIGHT)
c.setFillColor(GOLD); c.rect(0, 0, 12, H, fill=1, stroke=0)
c.setFillColor(Color(1,1,1)); c.setFont(BOLD, 18); c.drawString(62, H-88, "Cheng   x   UniMaker")
c.setFillColor(GOLD_L); c.setFont(BODY, 16); c.drawString(62, H-114, "把创造力、所有权与智能, 还给每一个人")
c.setFillColor(Color(0.98,0.98,0.98)); c.setFont(BOLD, 44)
c.drawString(60, H-206, "让一个人拥有")
c.drawString(60, H-262, "一支团队的生产力与所有权")
para(62, H-318, "AI 已经把一支团队的产能交给了个人, 但工具链、分发渠道、数据与智能仍然握在平台手里, "
                "个人和商家只能按月租用。我们补上缺失的那一半: 做得出来, 发得出去, 卖得掉, "
                "数据留在自己手里, 智能从自己的数据里长出来。",
     size=17, color=Color(0.80,0.83,0.90), maxw=820, leading=27)
chip(62, 96, "一次发布 · 各端秒开", Color(0.98,0.98,0.98), INDIGO)
chip(292, 96, "创作 · 生意 · 生活 全覆盖", NIGHT, GOLD_L)
chip(566, 96, "数据归己 · 智能归己", Color(0.90,0.95,0.95), Color(0.10,0.22,0.23))
c.showPage()

# ---------- 02 愿景 ----------
bg(); header("VISION", "把大公司级的底座, 交到每个人手里", 2)
para(56, 388, "过去, 只有大公司才养得起跨端研发、分发渠道、数据中台和算法团队。"
              "AI 解决了「做」的产能, 让一个人能产出一支团队的东西; "
              "我们解决剩下的一切: 发出去、卖得掉、数据留下来、智能长出来, 全程不求人。",
     size=17, maxw=848, color=INK, leading=26)
pillars = [
    ("全程自主", "从做出来到发出去、再到收到钱, 每一步都不受制于任何平台; 能力与收益回到个人和商家自己手里。"),
    ("原生体验", "只做一次, 在手机、电脑、平板上打开都像本机安装的应用一样快、一样稳; 跨端是底座的事, 不是你的事。"),
    ("智能生长", "你的生活与生意数据留在自己身边, 长出只属于你的助手; 千万个助手互相连接, 集体智能自己涌现。"),
]
x = 56
for t, d in pillars:
    card(x, 140, 276, 176, fill=Color(0.955,0.955,0.945))
    c.setFillColor(GOLD); c.rect(x, 140, 276, 7, fill=1, stroke=0)
    c.setFillColor(INDIGO); c.setFont(BOLD, 24); c.drawString(x+20, 276, t)
    para(x+20, 246, d, size=14, maxw=236, color=MUTED, leading=21)
    x += 292
c.showPage()

# ---------- 03 受众三角 ----------
bg(); header("WHO", "三类人, 同一条链 -- 衣食住行全覆盖", 3)
who = [
    ("创作者", "冷启动入口",
     "先做出内容与应用, 再一次发布到手机、电脑等各端, 打开就像原生应用一样快。"
     "作品、数据与收益默认归自己所有, 不再靠租用平台的账号体系才能活下去。", ZHU, ZHU_L),
    ("电商厂家", "供给与货架",
     "商品本身就是一个可以打开的应用: 详情、试用、售后、私域都在自己手里。"
     "支持单个上架, 也支持批量导入; 不必再付钱去别人的商城里租货架、买流量。", GOLD, GOLD_L),
    ("消费者", "规模与飞轮",
     "用起来就像装了一个原生应用: 买东西、点餐、出行、转卖闲置, 都在同一条链上完成。"
     "这些生活数据留在自己的设备上, 慢慢长出只属于自己的智能助手。", TEAL, TEAL_L),
]
x = 56
for t, tag, d, col, bgc in who:
    card(x, 118, 276, 278, fill=bgc)
    c.setFillColor(col); c.rect(x, 118, 276, 7, fill=1, stroke=0)
    c.setFillColor(col); c.setFont(BOLD, 24); c.drawString(x+20, 348, t)
    c.setFillColor(INK); c.setFont(BOLD, 16); c.drawString(x+20, 314, tag)
    para(x+20, 284, d, size=14, maxw=236, color=MUTED, leading=21)
    x += 292
para(56, 78, "创作者最愿意尝新, 所以用他们完成冷启动; 但市场的天花板不是创作者, 而是每个人的生活与每一门生意。",
     size=15, maxw=848, color=INK, leading=22)
c.showPage()

# ---------- 04 三堵墙 ----------
bg(); header("PROBLEM", "今天, 人、货、场都被三堵墙挡住", 4, kc=ZHU)
walls = [
    ("平台墙",
     "创作者把内容做完了, 却常常发不出去、也难被看见: 审核、限流、封号全都捏在别人手里。"
     "厂家要卖货, 只能去电商或短视频平台付费占位, 货架和进店的客人都是租来的。"
     "消费者则被锁在一个个封闭应用里, 换个设备就要重装、重新登录、从头再来。"),
    ("体验墙",
     "慢、卡、反复跳转, 已经成了所有人默认要付的成本。"
     "用户一不耐烦就走了, 可创作者与商家却说不清问题到底出在哪一层: "
     "是自己的产品做得不好, 还是宿主应用太重, 还是平台又悄悄改了规则。"),
    ("数据墙",
     "你创作的内容、成交的订单、每天买吃住行留下的行为, 都被平台收走去训练它们的模型。"
     "能力与钱不断流向中心机房, 很少再回到个人或商家手里。"
     "没有数据主权, 后面的智能与收益就都无从谈起。"),
]
x = 56
for i, (t, d) in enumerate(walls):
    card(x, 100, 276, 296, border=LINE)
    c.setFillColor(GOLD_L); c.setFont(BOLD, 32); c.drawString(x+18, 356, "0%d" % (i+1))
    c.setFillColor(ZHU); c.setFont(BOLD, 22); c.drawString(x+18, 318, t)
    c.setStrokeColor(ZHU); c.setLineWidth(2.5); c.line(x+18, 302, x+70, 302)
    para(x+18, 278, d, size=14, maxw=240, color=MUTED, leading=20)
    x += 292
c.showPage()

# ---------- 05 我们相信 ----------
bg(NIGHT); footer(5)
c.setFillColor(GOLD); c.rect(56, H-88, 40, 6, fill=1, stroke=0)
c.setFillColor(GOLD); c.setFont(BOLD, 16); c.drawString(56, H-74, "WHAT WE BELIEVE")
c.setFillColor(Color(0.98,0.98,0.98)); c.setFont(BOLD, 34); c.drawString(56, H-122, "我们相信的未来")
beliefs = [
    "一个人只做一次, 就该在每一个终端上都得到原生应用般的体验 -- 跨端适配是基础设施的责任, 不该是创作者和厂家的负担。",
    "内容、商品与身份应当留在你自己的设备上 -- 发布的那一刻就归你所有; 数据先是你的, 智能与收益才可能是你的。",
    "智能不应该只生长在少数公司的机房里 -- 每个人的生活与消费数据, 都足以长出一个只属于自己的助手。",
    "当千万个个人助手互相连接、分工协作, 集体智能会自己涌现 -- 这是通往更强智能的另一条路, 而且人人有份。",
]
y = H-176
for b in beliefs:
    c.setFillColor(GOLD); c.rect(56, y-2, 8, 8, fill=1, stroke=0)
    yy = para(80, y, b, size=17, color=Color(0.86,0.88,0.93), maxw=820, leading=26)
    y = yy - 12
c.showPage()

# ---------- 06 四层自主栈 ----------
bg(); header("THE STACK", "四层叠成一条自主之路", 6)
layers = [
    ("层四", "智能体网络", "个人助手互相连接, 真本事可以交易, 网络越用越聪明", TEAL, TEAL_L),
    ("层三", "价值结算", "算力可租也可本地, 分发按量计费, 作者与商家自动分到钱", GOLD, GOLD_L),
    ("层二", "发布入口 UniMaker", "一次发布各端秒开; 创作、上架、生活服务都从这里进来", ZHU, ZHU_L),
    ("层一", "自主语言 Cheng", "自己站得住的技术地基, 各端原生, 不被别人的库卡住脖子", INDIGO, IND_L),
]
y = 338
for tag, t, d, col, bgc in layers:
    card(56, y, W-112, 66, fill=bgc)
    c.setFillColor(col); c.rect(56, y, 9, 66, fill=1, stroke=0)
    c.setFillColor(col); c.setFont(BOLD, 16); c.drawString(82, y+40, tag)
    c.setFillColor(INK); c.setFont(BOLD, 18); c.drawString(144, y+38, t)
    c.setFillColor(MUTED); c.setFont(BODY, 16); c.drawString(144, y+12, d)
    y -= 74
para(56, 64, "越往上越贴近人和生意, 越往下越是难以复制的地基。"
             "四层在同一条链上、全部自己掌控 -- 竞争者很难只抄走其中一层就追上来。",
     size=16, maxw=848, color=MUTED, leading=23)
c.showPage()

# ---------- 07 层一 Cheng ----------
bg(); header("LAYER 1", "Cheng: 地基已经站稳", 7, kc=INDIGO)
para(56, 388, "没有一个自己站得住的底层, 上面盖的一切都等于租来的。"
              "Cheng 是这条自主之路的地基: 它能自己编译自己, 在真机上跑得起来, 关键能力一样都不依赖别人。",
     size=16, maxw=848, leading=25)
feats = [
    ("自己造自己", "用自己写的工具把自己完整编译出来, 结果稳定、可复现 -- 这证明地基是真的站住了, 不是演示片。"),
    ("各端真机可用", "在安卓与鸿蒙等真机上跑通并交叉验证过; 我们交付的是能用的体验, 不是概念视频。"),
    ("关键能力自控", "网络与安全等核心能力自己实现、自己掌握, 不会被第三方库突然断供或者改协议卡住。"),
    ("还在持续变快", "目标很清晰: 体验持续逼近业界最快一档; 现在每一处日常改动都能更快落到产品里。"),
]
xs = [56, 496]
for i, (t, d) in enumerate(feats):
    xx = xs[i % 2]; yy = 238 if i < 2 else 120
    card(xx, yy, 408, 104, border=LINE)
    c.setFillColor(INDIGO); c.rect(xx, yy, 7, 104, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont(BOLD, 18); c.drawString(xx+22, yy+72, t)
    para(xx+22, yy+48, d, size=14, maxw=364, color=MUTED, leading=20)
c.showPage()

# ---------- 08 Cheng Code ----------
bg(); header("FOR BUILDERS", "让 AI 写代码像真人专家", 8, kc=INDIGO)
para(56, 388, "人、货、场的背后, 仍然需要有人把产品真正做出来。"
              "Cheng Code 让 AI 助手少猜测、少翻文件、改错了立刻知道 -- 人和 AI 都因此更快。",
     size=16, maxw=848, leading=24)
metrics = [
    ("4→1", "少问几次", "查一处引用, 一步拿到答案"),
    ("8-18倍", "少读废话", "同样的信息, 输入薄一个量级"),
    ("≈90%", "更省成本", "单次操作少读约九成内容"),
    ("~0ms", "几乎不等", "工具热起来后, 即问即答"),
]
x = 56
for v, t, d in metrics:
    card(x, 196, 208, 158, border=LINE)
    c.setFillColor(INDIGO); c.setFont(BOLD, 32); c.drawString(x+16, 296, v)
    c.setFillColor(INK); c.setFont(BOLD, 16); c.drawString(x+16, 266, t)
    para(x+16, 240, d, size=15, maxw=176, color=MUTED, leading=21)
    x += 220
para(56, 158, "写代码时就报错, 改接口立刻知道影响到哪里, 崩溃直接定位到那一行。"
              "以上数字是实测下界: AI 少绕路, 人少等待, 整条任务只会更快、更省。",
     size=16, maxw=848, color=MUTED, leading=23)
c.showPage()

# ---------- 09 层二 UniMaker ----------
bg(); header("LAYER 2", "UniMaker: 发布与触达的入口", 9, kc=ZHU)
para(56, 388, "把整条自主能力收进一次点击: 做内容、上商品、发生活服务, 发布之后各端立刻能打开; "
              "已有的作品和货架也能迁进来, 不必推倒重来。",
     size=16, maxw=848, leading=25)
metrics = [
    ("944ms", "发布到可见", "点一下发布, 别人立刻能看到"),
    ("0ms", "再次打开", "内容命中即秒开, 几乎零等待"),
    ("560ms", "首次连接", "第一次握手, 冷启动也够快"),
    ("秒开", "各端原生感", "安卓与鸿蒙真机交叉验证"),
]
x = 56
for v, t, d in metrics:
    card(x, 196, 208, 158, border=LINE)
    c.setFillColor(ZHU); c.setFont(BOLD, 32); c.drawString(x+16, 296, v)
    c.setFillColor(INK); c.setFont(BOLD, 16); c.drawString(x+16, 266, t)
    para(x+16, 240, d, size=14, maxw=176, color=MUTED, leading=20)
    x += 220
para(56, 154, "秒发秒开, 再加上 AI 生成与一键迁移 -- "
              "一个人或一家小店, 就能拿到过去要整支团队才能维持的多端分发效率。",
     size=16, maxw=848, color=INK, leading=24)
c.showPage()

# ---------- 10 小优原生 computer use ----------
bg(); header("NATIVE ASSISTANT", "小优: 说一句话, 手机自己把事办完", 10, kc=ZHU)
para(56, 388, "UniMaker 内置原生 AI 助手「小优」: 「帮我把这条视频发出去」「帮我买一台咖啡机」, "
              "一句话先变成一张可核对的任务清单, 再由小优替你一步步办完发布、上架、购买与搜索。",
     size=16, maxw=848, leading=24)
cu = [
    ("说完就办", "发视频、上商品、买东西、找二手, 语音直接变成可核对的执行步骤"),
    ("控件级精准", "直接调用每个控件的语义接口, 不截屏、不猜坐标, 界面改版也不怕"),
    ("全程看得懂", "可切换成慢速回放模式, 每一步在界面上演给你看, 快慢由你定"),
    ("关键动作必确认", "对外发布与付款是不可逆动作, 永远停在你点头确认之后才执行"),
]
x = 56
for t, d in cu:
    card(x, 196, 208, 158, border=LINE)
    c.setFillColor(ZHU); c.rect(x, 347, 208, 7, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont(BOLD, 17); c.drawString(x+16, 312, t)
    para(x+16, 284, d, size=13, maxw=176, color=MUTED, leading=19)
    x += 220
para(56, 154, "市面上的「AI 操作手机」靠截屏、识字、猜坐标, 又慢又容易点错; "
              "小优因为整条栈都是自己写的, 天生拿得到界面的语义接口 -- 这是原生与外挂的代差, "
              "也是智能体网络今天已经落地的第一块砖。",
     size=16, maxw=848, color=INK, leading=23)
c.showPage()

# ---------- 11 数据主权 ----------
bg(); header("YOUR DATA", "发布即归你: 数据留在你这边", 11, kc=ZHU)
para(56, 388, "别人把「数据主权」做成一套需要用户自己折腾的协议; "
              "我们把它做成默认设置: 创作者、商家和消费者几乎无感, 而平台从设计上就拿不走你的东西。",
     size=16, maxw=848, leading=25)
sov = [
    ("钥匙在你手里", "解锁身份用的是你自己设备上的密钥, 不托管在任何平台的账号体系里。"),
    ("内容在你设备", "作品、商品与媒体优先存在本机和点对点网络里, 没有中心仓库替你「保管」一切。"),
    ("平台拿不走本体", "需要结算时可以上链留下凭证, 但内容本体不交给平台囤积 -- 从设计上切断数据掠夺。"),
]
x = 56
for t, d in sov:
    card(x, 188, 276, 168, border=LINE)
    c.setFillColor(ZHU); c.rect(x, 188, 276, 7, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont(BOLD, 18); c.drawString(x+18, 320, t)
    para(x+18, 292, d, size=14, maxw=240, color=MUTED, leading=20)
    x += 292
para(56, 146, "数据先是你的, 智能与收益才可能是你的 -- 这就是通往经济层和智能体层的那座桥。",
     size=16, maxw=848, color=INK, leading=24)
c.showPage()

# ---------- 12 层三 价值结算 ----------
bg(); header("LAYER 3", "让算力、分发与收益, 人人可接入", 12)
para(56, 398, "这是自主之路的经济层: 本地使用永远免费, 走网络协作才按量结算, 谁创造价值谁自动分润。"
              "结算用统一数字货币 RWAD: 买入时按 1 美元等值铸造, 对应黄金、比特币与港元稳定币储备, "
              "价值随储备净值浮动 -- 法币计价、按净值折算, 持有即分享储备增长。",
     size=15.5, color=MUTED, maxw=848, leading=22)
feat = [
    ("发得更省", "只传输真正变化的部分, 重复内容自动去重; 发得越频繁, 省得越明显。"),
    ("算力可租可本地", "想用网络算力就按量付费; 想完全本地运行, 永远免费, 谁也绑架不了你。"),
    ("作者与商家自动分润", "计算与分发产生的费用, 按贡献自动分给作者和商家, 不用等平台「赏赐」。"),
    ("生态不散架", "版本与兼容有明确的规矩, 依赖不会散成一地鸡毛, 生态可以长期协作下去。"),
]
xs = [56, 496]
for i, (t, d) in enumerate(feat):
    xx = xs[i % 2]; yy = 222 if i < 2 else 94
    card(xx, yy, 408, 118, border=LINE)
    c.setFillColor(GOLD); c.rect(xx, yy, 7, 118, fill=1, stroke=0)
    c.setFillColor(GOLD); c.setFont(BOLD, 17); c.drawString(xx+22, yy+84, t)
    para(xx+22, yy+58, d, size=15, maxw=364, color=MUTED, leading=21)
c.showPage()

# ---------- 13 层四 智能体网络 ----------
bg(); header("LAYER 4", "通往超级智能的另一条路", 13, kc=TEAL)
para(56, 378, "公开互联网上的数据快被采光了。最大的未开采矿藏, 是每个人设备里的私有生活 -- "
              "而只有数据归你所有, 用它长出智能才合法、才可能。",
     size=16, color=INK, maxw=848, leading=24)
flow = [
    ("你的数据", "生活、创作与消费留在设备上, 是平台拿不走的独有养料"),
    ("你的助手", "智能长在数据旁边, 懂你、帮你、只属于你"),
    ("真本事市场", "助手之间交易可验证的能力, 吹牛没有市场"),
    ("网络变聪明", "个体有限, 互联与分工之后, 涌现出集体智能"),
]
bx, by, bw, bh, gap = 56, 188, 196, 148, 20
for i, (t, d) in enumerate(flow):
    xx = bx + i*(bw+gap)
    card(xx, by, bw, bh, fill=CARD, border=LINE)
    c.setFillColor(TEAL); c.rect(xx, by+bh-7, bw, 7, fill=1, stroke=0)
    c.setFillColor(TEAL_L); c.setFont(BOLD, 26); c.drawString(xx+14, by+bh-38, "%d" % (i+1))
    c.setFillColor(INK)
    para(xx+14, by+bh-60, t, font=BOLD, size=16, maxw=bw-28, leading=20)
    para(xx+14, by+bh-86, d, size=13, maxw=bw-28, color=MUTED, leading=19)
    if i < 3:
        c.setFillColor(FAINT); c.setFont(BOLD, 20)
        c.drawCentredString(xx+bw+gap/2, by+bh/2-4, ">")
para(56, 148, "人类文明就是先例: 个体能力有限, 靠交流与分工长出了文明级的智能。"
              "我们把同一件事, 让智能体网络再做一遍。",
     size=16, maxw=848, color=INK, leading=23)
chip(56, 88, "数据归己", Color(0.99,0.99,0.99), TEAL)
chip(176, 88, "个人助手", Color(0.99,0.99,0.99), TEAL)
chip(296, 88, "真本事可验", Color(0.99,0.99,0.99), TEAL)
chip(440, 88, "互联协作", Color(0.99,0.99,0.99), TEAL)
chip(560, 88, "网络涌现", Color(0.99,0.99,0.99), TEAL)
c.showPage()

# ---------- 14 为什么赢 ----------
bg(); header("WHY WE WIN", "无论智能诞生在哪里, 这张网络都赢", 14, kc=TEAL)
wins = [
    ("数据在我们这边", "公开数据接近见底, 私有数据在每个人的口袋里; 平台不放弃垄断模式, 就永远够不着这座矿。"),
    ("路径被验证过", "个体有限, 加上交流, 加上市场, 就长出了文明。人类已经证明过一次, 我们只是让助手也走同一条路。"),
    ("真本事说了算", "开放市场最怕吹牛; 可验证的交付让「真有用」成为硬通货, 滥竽充数的能力自然出局。"),
    ("结构上双赢", "就算最强的智能先诞生在别人的机房, 它要触达每个人, 也得经过数据、分发与结算这三层 -- 而这三层都在这张网络里。"),
]
xs = [56, 496]
for i, (t, d) in enumerate(wins):
    xx = xs[i % 2]; yy = 236 if i < 2 else 98
    card(xx, yy, 408, 128, border=LINE)
    c.setFillColor(TEAL); c.rect(xx, yy, 7, 128, fill=1, stroke=0)
    c.setFillColor(TEAL); c.setFont(BOLD, 18); c.drawString(xx+22, yy+94, t)
    para(xx+22, yy+68, d, size=14, maxw=362, color=MUTED, leading=20)
c.showPage()

# ---------- 15 护城河 ----------
bg(); header("THE MOAT", "为什么这条路会越走越宽", 15)
moat = [
    ("难抄的地基", "能自己编译自己的底层语言, 极难在短期内复制; 大多数新方案停在「能演示」, 到不了「能自持」。"),
    ("源码不出网络", "源码全部托管在自有网络, 只能经专用工具链编译链接; 免费使用, 但拿不走、抄不到。"),
    ("数据绑定智能", "智能长在用户自己的数据旁边; 抄一个产品界面容易, 抄「数据归用户」的结构极难。"),
    ("四层互相加速", "语言、入口、结算、助手在同一条链上; 任何一层变强, 另外三层都跟着变强。"),
]
xs = [56, 496]
for i, (t, d) in enumerate(moat):
    xx = xs[i % 2]; yy = 244 if i < 2 else 106
    card(xx, yy, 408, 128, border=LINE)
    c.setFillColor(INDIGO); c.setFont(BOLD, 24); c.drawString(xx+18, yy+90, str(i+1))
    c.setFillColor(INK); c.setFont(BOLD, 17); c.drawString(xx+50, yy+92, t)
    para(xx+18, yy+64, d, size=14, maxw=370, color=MUTED, leading=20)
para(56, 88, "知识产权: 第一批 5 件发明专利已通过专利代理机构初审并提交申请, 覆盖确定性事实编码、"
             "预言机事实准入、确定性编排与执行回执、可恢复状态单元、AI 候选门禁 -- 全部落在结算与验证协议层。"
             "语言免费使用但源码留在自有网络, 专利作防御性使用, 护住结算协议。",
     size=14, maxw=848, color=INK, leading=20)
c.showPage()

# ---------- 16 四个阶段 ----------
bg(); header("THE ARC", "愿景弧线: 四个阶段", 16)
phases = [
    ("阶段一 · 地基已立", "自主语言站稳, 安卓、鸿蒙等真机能交付体验", INDIGO),
    ("阶段二 · 入口打开", "UniMaker 公测: 创作、上架、生活服务, 数据默认归己", ZHU),
    ("阶段三 · 经济飞轮", "算力与分发按量计费, 作者与商家的收益自动闭环", GOLD),
    ("阶段四 · 智能涌现", "个人助手互联成网, 真本事可交易, 网络自己变聪明", TEAL),
]
y = 338
for t, mid, col in phases:
    card(56, y, W-112, 66, border=LINE)
    c.setFillColor(col); c.rect(56, y, 9, 66, fill=1, stroke=0)
    c.setFillColor(col); c.setFont(BOLD, 18); c.drawString(84, y+36, t)
    c.setFillColor(INK); c.setFont(BODY, 15); c.drawString(340, y+36, mid)
    y -= 72
para(56, 66, "我们现在站在阶段一: 地基已经能自己站住。"
             "往上每一层都为下一层供能 -- 体验撑起入口, 数据主权喂养助手, 经济让网络自己长大。",
     size=16, maxw=848, color=MUTED, leading=23)
c.showPage()

# ---------- 17 商业模式 ----------
bg(); header("BUSINESS", "怎么赚钱: 与四层一一对应", 17, kc=INDIGO)
biz = [
    ("语言层", "免费 + 受控源码", "语言免费使用; 源码托管自有网络, 只经 Cheng Code 编译链接, 拿不走; 专利防御护航。"),
    ("入口层", "订阅 + 企业版", "个人订阅带来日常现金流; 厂家与企业的私有部署贡献大客单价。"),
    ("经济层", "网络服务抽成", "走网络的算力与分发按量抽成; 完全本地使用, 永久免费。"),
    ("智能体层", "交易抽成", "助手之间买卖知识、技能与算力时收取服务费; 规模越大, 飞轮越快。"),
]
y = 348
for t, m, d in biz:
    card(56, y, W-112, 66, fill=Color(0.955,0.955,0.945))
    c.setFillColor(INDIGO); c.setFont(BOLD, 16); c.drawString(78, y+36, t)
    c.setFillColor(GOLD); c.setFont(BOLD, 16); c.drawString(186, y+36, m)
    para(400, y+40, d, size=15, maxw=480, color=MUTED, leading=21)
    y -= 72
para(56, 66, "底层免费使用建立生态, 入口、网络与助手逐级变现 -- 从开发者到创作者、厂家、消费者, 再到智能网络的收益链。",
     size=16, maxw=848, color=MUTED, leading=23)
c.showPage()

# ---------- 18 结尾 ----------
bg(NIGHT)
c.setFillColor(GOLD); c.rect(0, 0, 12, H, fill=1, stroke=0)
c.setFillColor(Color(0.98,0.98,0.98)); c.setFont(BOLD, 40)
c.drawString(60, H-168, "自主的创造力,")
c.drawString(60, H-222, "自主的数据, 自主生长的智能")
para(62, H-276, "地基已经站住。接下来, 把发布入口交到创作者、厂家和消费者手里, "
                "让经济飞轮转起来, 让智能从每个人自己的数据里长出来 -- "
                "一步一步, 把过去只有大公司才有的能力, 还给每一个人。",
     size=17, color=Color(0.82,0.85,0.91), maxw=820, leading=27)
chip(62, 142, "地基语言", Color(0.98,0.98,0.98), INDIGO)
chip(178, 142, "发布入口 · 数据归己", NIGHT, GOLD_L)
chip(420, 142, "价值结算", GOLD_L, Color(0.20,0.18,0.12))
chip(560, 142, "智能体网络", Color(0.90,0.95,0.95), Color(0.10,0.22,0.23))
c.setFillColor(FAINT); c.setFont(BODY, 16)
c.drawString(62, 88, "Cheng x UniMaker   ·   一次发布, 处处可用, 数据归己, 智能涌现")
c.showPage()

c.save()
shutil.copy2(OUT, OUT_CN)
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
print("WROTE", OUT_CN, os.path.getsize(OUT_CN), "bytes")
