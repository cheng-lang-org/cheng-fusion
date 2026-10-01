from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


ROOT = Path("/Users/lbcheng/cheng-lang")
SOURCE = ROOT / "output/docx/Cheng-UniMaker商业计划书1-分布式AI版.docx"
OUTPUT = ROOT / "output/docx/Cheng-UniMaker商业计划书1-分布式AI融资调整版.docx"


def replace_paragraph_text(paragraph, text: str) -> None:
    if paragraph.runs:
        paragraph.runs[0].text = text
        for run in paragraph.runs[1:]:
            run._element.getparent().remove(run._element)
    else:
        paragraph.add_run(text)


def replace_cell_text(cell, text: str) -> None:
    paragraph = cell.paragraphs[0]
    replace_paragraph_text(paragraph, text)
    for extra in list(cell.paragraphs[1:]):
        extra._element.getparent().remove(extra._element)


def paragraph_starting(document, prefix: str):
    matches = [p for p in document.paragraphs if p.text.startswith(prefix)]
    if len(matches) != 1:
        raise RuntimeError(f"expected one paragraph starting with {prefix!r}, got {len(matches)}")
    return matches[0]


def table_with_header(document, header: tuple[str, ...]):
    matches = []
    for table in document.tables:
        first_row = tuple(cell.text for cell in table.rows[0].cells)
        if first_row == header:
            matches.append(table)
    if len(matches) != 1:
        raise RuntimeError(f"expected one table with header {header!r}, got {len(matches)}")
    return matches[0]


def set_row(row, values: tuple[str, str, str]) -> None:
    if len(row.cells) != len(values):
        raise RuntimeError("budget row has unexpected column count")
    for cell, value in zip(row.cells, values):
        replace_cell_text(cell, value)


def normalize_cjk_fonts(document) -> None:
    replacements = {
        "宋体": "Songti SC",
        "黑体": "Heiti SC",
        "zh-CN": "Songti SC",
    }
    roots = [document.element, document.styles.element]
    for section in document.sections:
        roots.extend(
            [
                section.header.part.element,
                section.first_page_header.part.element,
                section.even_page_header.part.element,
                section.footer.part.element,
                section.first_page_footer.part.element,
                section.even_page_footer.part.element,
            ]
        )
    seen = set()
    for root in roots:
        root_id = id(root)
        if root_id in seen:
            continue
        seen.add(root_id)
        for fonts in root.iter(qn("w:rFonts")):
            current = fonts.get(qn("w:eastAsia"))
            if current in replacements:
                fonts.set(qn("w:eastAsia"), replacements[current])


def main() -> None:
    document = Document(SOURCE)

    replace_paragraph_text(
        paragraph_starting(document, "本轮融资 1000 万元人民币, 用于持续迭代"),
        "本轮融资 1000 万元人民币, 用于持续迭代 Cheng 语言与 UniMaker, 并完成三项关键交付: "
        "3 个月内交付基于自研语言的操作系统开发者预览版(Linux 内核 + 全栈 Cheng 自主用户态, 开机即 UniMaker); "
        "6 个月内交付首批专用移动设备并完成 CSG 交易安全审计与端到端交易链路闭环; "
        "9 个月内分别闭合分布式推理与分布式训练的生产门禁, 形成真实节点、真实任务和可复验的性能、成本与收敛数据。"
        "以「语言 → 操作系统 → 设备 → 可验证算力与结算网络」的全栈自主格局, 进入下一轮增长叙事。",
    )

    replace_paragraph_text(
        paragraph_starting(document, "融资后的人力扩张不投向编译器"),
        "融资后的人力扩张不投向编译器——该线由 AI 多智能体体系继续承担, 正确性由门禁保证, 不由人数保证。"
        "分布式 AI 的专项预算主要用于真实节点与算力、模型与数据、跨机网络、可观测性、故障恢复和基准验收, "
        "核心实现仍由 AI 多智能体体系与核心决策者推进。招聘集中在系统集成、硬件项目管理、CSG 方言生态与商家运营; "
        "每条新线设一名归属人, 保护核心决策者的注意力留在架构与正确性标准上。",
    )

    replace_paragraph_text(
        paragraph_starting(document, "本轮融资 1000 万元人民币, 规划 12 个月运行周期。"),
        "本轮融资 1000 万元人民币, 规划 12 个月运行周期。预算以可验收交付为单位: "
        "语言与编译器、分布式推理、分布式训练分别列项, 避免核心里程碑与资金用途脱节。"
        "人力招聘集中投向必须由人完成的系统集成、硬件项目管理、CSG 方言生态和商业运营; "
        "分布式 AI 专项资金用于真实算力、跨机实验、故障恢复与指标验收。预算分配如下:",
    )

    roadmap = table_with_header(document, ("时间", "里程碑", "交付物与验收标准"))
    m6_rows = [
        row
        for row in roadmap.rows
        if row.cells[0].text == "M6" and row.cells[1].text.startswith("首批专用移动设备")
    ]
    if len(m6_rows) != 1:
        raise RuntimeError(f"expected one M6 row, got {len(m6_rows)}")
    replace_cell_text(
        m6_rows[0].cells[2],
        "ODM 路线交付满足种子测试所需的首批工程批, 预装 Cheng OS 与 UniMaker; "
        "设备数量在 ODM 报价、NRE 与认证成本锁定后确定, 不以未经报价验证的台数作为融资承诺。",
    )

    budget = table_with_header(document, ("方向", "预算(万元)", "内容与产出"))
    if len(budget.rows) != 9:
        raise RuntimeError(f"unexpected initial budget row count: {len(budget.rows)}")

    total_row = budget.rows[-1]._tr
    template_row = budget.rows[-2]._tr
    for _ in range(2):
        total_row.addprevious(deepcopy(template_row))

    rows = (
        ("语言与编译器", "100", "AI 多智能体算力与工具链投入; 持续推进编译与运行性能, 以回归门禁和自举不动点保证正确性。"),
        ("分布式推理生产化", "120", "以一个参考模型闭合真实权重载入与分片、2-4 个异构节点跨机调度、故障恢复、可观测性和长稳运行; 输出 tokens/s、P95 延迟与单位成本。"),
        ("分布式训练验证", "80", "以一个中小型参考模型闭合真实反向传播与优化器、DiLoCo 低频增量合并、检查点恢复及单节点基线收敛对照; 本轮不承诺超大模型完整预训练。"),
        ("Cheng OS(用户态 + BSP 集成)", "150", "1 名系统集成工程师负责 BSP 外包验收与整机集成; Cheng 用户态栈继续走 AI 攻坚线(在验证工具链覆盖范围内)。"),
        ("专用移动设备(工程批)", "250", "1 名硬件项目经理负责 ODM 谈判、供应链、入网认证与工程批品控; NRE + 首批工程批, 预装 Cheng OS 交付种子用户。"),
        ("CSG 方言与语言生态", "60", "核心负责人配合专项外部协作, 完成方言规范治理、第三方方言评审、样例方言、文档教程与开发者布道。"),
        ("UniMaker 公测与商家运营", "100", "种子用户支持与商家侧 BD; 采集订阅转化与留存数据, 支撑下一轮估值。"),
        ("CSG 交易安全与链路闭环", "100", "自研加密与结算协议第三方安全审计; RWAD 结算链部署与 UniMaker 接通; 闭合发布、购买、结算与分润。"),
        ("运营、法务与专利", "40", "公司基础运营、5 件发明专利审查答复与后续布局。"),
    )
    if len(budget.rows) != len(rows) + 2:
        raise RuntimeError(f"unexpected expanded budget row count: {len(budget.rows)}")
    for row, values in zip(budget.rows[1:-1], rows):
        set_row(row, values)
    set_row(budget.rows[-1], ("合计", str(sum(int(row[1]) for row in rows)), ""))

    normalize_cjk_fonts(document)
    document.save(OUTPUT)

    check = Document(OUTPUT)
    check_budget = table_with_header(check, ("方向", "预算(万元)", "内容与产出"))
    amounts = [int(row.cells[1].text) for row in check_budget.rows[1:-1]]
    if sum(amounts) != 1000 or check_budget.rows[-1].cells[1].text != "1000":
        raise RuntimeError("budget total is not 1000")
    labels = [row.cells[0].text for row in check_budget.rows[1:-1]]
    if labels.count("分布式推理生产化") != 1 or labels.count("分布式训练验证") != 1:
        raise RuntimeError("distributed AI budget rows are missing or duplicated")
    if any("语言、编译器与分布式 AI 引擎" in p.text for p in check.paragraphs):
        raise RuntimeError("obsolete combined budget label remains in paragraphs")

    print(OUTPUT)


if __name__ == "__main__":
    main()
