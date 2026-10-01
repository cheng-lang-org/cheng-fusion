#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cheng x UniMaker 可转股融资条款清单 (Term Sheet 草稿, Word)。"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = "/Users/lbcheng/cheng-lang/output/docx/Cheng-UniMaker融资条款清单草稿.docx"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

INK    = RGBColor(0x1A, 0x1C, 0x24)
INDIGO = RGBColor(0x29, 0x38, 0x69)
GOLD_D = RGBColor(0x8A, 0x6A, 0x1F)
MUTED  = RGBColor(0x52, 0x54, 0x5E)

doc = Document()

def set_font(style, name_cn, size, color=INK, bold=False):
    style.font.name = "Times New Roman"
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.color.rgb = color
    style._element.rPr.rFonts.set(qn("w:eastAsia"), name_cn)

normal = doc.styles["Normal"]
set_font(normal, "宋体", 12)  # 小四
normal.paragraph_format.line_spacing = 1.4
normal.paragraph_format.space_after = Pt(6)

h1s = doc.styles["Heading 1"]
set_font(h1s, "黑体", 14, INDIGO, True)
h1s.paragraph_format.space_before = Pt(12)
h1s.paragraph_format.space_after = Pt(6)

for sec in doc.sections:
    sec.left_margin = Cm(2.4); sec.right_margin = Cm(2.4)
    sec.top_margin = Cm(2.4); sec.bottom_margin = Cm(2.2)

def para(text, size=None, color=None, bold=False, align=None, space_after=None):
    p = doc.add_paragraph(text)
    for run in p.runs:
        if size: run.font.size = Pt(size)
        if color: run.font.color.rgb = color
        run.font.bold = bold
    if align is not None: p.alignment = align
    if space_after is not None: p.paragraph_format.space_after = Pt(space_after)
    return p

def h1(t): return doc.add_paragraph(t, style="Heading 1")

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear"); shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)

def table(rows, widths_cm, header=True):
    t = doc.add_table(rows=len(rows), cols=len(rows[0]))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(rows):
        for j, text in enumerate(row):
            cell = t.cell(i, j)
            cell.width = Cm(widths_cm[j])
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(text)
            run.font.size = Pt(10)
            run.font.name = "Times New Roman"
            run._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
            p.paragraph_format.space_after = Pt(2)
            if header and i == 0:
                run.font.bold = True
                run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
                shade(cell, "F4F3EE")
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

# ---------- 标题 ----------
para("Cheng x UniMaker", size=16, color=INDIGO, bold=True,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("可转股融资条款清单(草稿)", size=20, bold=True,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("商务讨论框架 · 非正式要约", size=10.5, color=MUTED,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
para("版本: 2026-07    本文件仅为商务讨论框架, 不构成要约; 正式条款以律师出具的交易文件为准。",
     size=9, color=MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)

# ---------- 一、交易概要 ----------
h1("一、交易概要")
table([
    ["条款", "内容"],
    ["公司", "Cheng x UniMaker 运营主体(拟设/现有有限责任公司)"],
    ["融资方式", "可转股协议(借款加转股权)"],
    ["募集总额", "1,000 万元人民币"],
    ["单笔票额", "大额投资人不少于 100 万元直接签署; 不足 100 万元经持股平台聚合(见第三节)"],
    ["资金用途", "语言与编译器迭代、Cheng 操作系统、首批专用移动设备(工程批)、交易安全与链路闭环、方言生态建设(详见商业计划书第十三章)"],
    ["关闭机制", "设定截止日, 到期一次关闭; 先到先得, 超额认购时公司有权调减"],
], [3.4, 12.2])

# ---------- 二、转股条款 ----------
h1("二、转股条款")
table([
    ["条款", "内容"],
    ["估值上限", "投前估值 8,000 万至 1 亿元人民币(以领投最终谈定为准, 全体投资人统一)"],
    ["转股折扣", "15%至 20%; 转股价取「按估值上限定价」与「下一轮价格乘以(1减折扣)」二者中更低者"],
    ["触发转股", "公司完成下一轮合格融资(单轮募集不少于 2,000 万元)时, 本金自动按上述规则转为公司股权"],
    ["到期安排", "签署后 18 至 24 个月未发生合格融资: 投资人可选(甲)按估值上限转股; 或(乙)要求还本付息"],
    ["利息", "0 至 6% 单利(目标为 0, 以谈判为准); 转股时利息一并转股或豁免"],
    ["员工股份池", "转股计算前, 公司预留 10%至 15% 员工股份池; 该池稀释由转股前股东承担, 早期投资人不被二次稀释"],
    ["并购或清算处理", "转股前发生控制权变更: 投资人可选按估值上限转股参与分配, 或按本金 1.5 至 2 倍优先受偿(以谈判为准)"],
], [3.4, 12.2])

# ---------- 三、小额投资安排 ----------
h1("三、小额投资安排(有限合伙持股平台)")
table([
    ["条款", "内容"],
    ["结构", "设立有限合伙企业作为持股平台: 小额投资人担任有限合伙人, 公司创始人或领投指定主体担任普通合伙人"],
    ["出资门槛", "持股平台内单笔最低 10 万至 20 万元; 低于门槛不予接纳"],
    ["条款一致", "持股平台整体与大额投资人签署同一估值上限、同一折扣的可转股协议, 无特殊条款"],
    ["股东名册", "转股后持股平台仅占一个股东席位, 保持股权结构清晰"],
    ["权利安排", "分红等经济权益归有限合伙人按出资比例享有; 对公司的表决权由普通合伙人集中统一行使; 有限合伙人享有年度信息权"],
    ["人数与合规", "有限合伙人人数不超过 50 人; 仅向合格投资者定向沟通, 不进行任何形式的公开劝募; 全体有限合伙人签署风险揭示与资金来源确认; 不接受任何代持安排"],
], [3.4, 12.2])

# ---------- 四、治理与信息权 ----------
h1("四、治理与信息权")
table([
    ["条款", "内容"],
    ["董事会", "本轮不设投资人董事席位, 不设一票否决"],
    ["信息权", "投资人享有季度经营简报(里程碑进展、资金消耗、关键数据)"],
    ["保护性条款", "限于: 修改可转股协议核心条款、公司清算/解散、向第三方转让核心知识产权, 需经代表本轮多数本金的投资人同意"],
    ["知识产权", "Cheng 语言、UniMaker、CSG-Core 协议及第一批 5 件已提交发明专利均归属公司主体"],
    ["排他与保密", "签署后 45 至 60 天排他期; 双方对条款与商业信息承担保密义务"],
], [3.4, 12.2])

# ---------- 五、里程碑承诺(信息性) ----------
h1("五、里程碑(信息性条款, 非对赌)")
table([
    ["时间", "里程碑"],
    ["M3", "Cheng OS 开发者预览版: Linux 内核 + 全栈 Cheng 自主用户态, 开发板真机开机即 UniMaker"],
    ["M6", "首批专用移动设备(工程批, 数百台)交付种子用户; CSG 交易安全通过第三方审计; 发布→购买→结算→分润端到端闭环真机演示"],
    ["M6-M9", "UniMaker 公测, 采集订阅转化与留存数据"],
    ["M9-M12", "启动下一轮增长融资"],
], [2.4, 13.2])
para("注: 上述里程碑为经营计划信息, 不构成业绩对赌或回购触发条件。", size=9, color=MUTED)

# ---------- 尾注 ----------
h1("六、其他")
para("1. 本条款清单不具有法律约束力(保密与排他条款除外), 正式权利义务以各方签署的交易文件为准。")
para("2. 全体投资人(含持股平台)签署同一版本协议文本, 不设个案特殊条款。")
para("3. 交易文件由公司聘请的融资律师统一起草。")

doc.save(OUT)
print("WROTE", OUT, os.path.getsize(OUT), "bytes")
