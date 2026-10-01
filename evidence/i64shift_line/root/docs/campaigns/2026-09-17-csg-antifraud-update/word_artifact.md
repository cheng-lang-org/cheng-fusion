# Word模板执行合同

参考：/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-17-csg-antifraud-update/before/CSG反诈交易执行控制技术交底书_中国申请版_10项.docx，SHA256 14ff2e3ef3fa4b5add595129ebc1a03e45d319eb0d4ec2550518cee5e18db42e，12页，单节。

页面：Letter 8.5×11英寸，上0.75、下0.7、左右0.9英寸，页眉0.5、页脚0.3英寸；无首页专属节。全部沿用参考sectPr。

字体：正文Arial及Songti SC 12pt，固定20pt，段后7pt。Title为Arial及Heiti SC 20pt粗体、固定27pt、段后16pt、居中；Heading1为15pt，Heading2为12.5pt，均黑色粗体、固定21pt、段前14后8、与下段同页。Table Text及Small Note为10.5pt、固定16pt、段后3pt。原样保留styles.xml。

表格：克隆参考3列表格0及2列表格2，居中、固定列宽；灰色细网格，淡灰蓝表头，重复表头，行不可拆分，上下90twip、左右105twip边距。正文段落使用原有Normal样式。

流程图：沿用白底灰色线框、自上而下路径、右侧失败出口。替换源图及替代文本，保留宽6.55英寸、图后分页模式。图前章节独立起页。权利要求独立起页；后续实施例顺排，避免权利要求末页大幅留白。

内容槽：word/document.xml的body除末尾sectPr外均为待替换内容。依Markdown结构添加Title、Heading1、Heading2、Normal、Small Note、表格及流程图，容量随自然分页增长。标题中的顿号或逗号改为空格，仅作格式调整；正文及10项权利要求保持完整。图替换原Mermaid代码，替代文本保留代码。

页眉页脚：空页眉，页脚居中“第 PAGE 页，共 NUMPAGES 页”，footer.xml及关系原字节保留。settings.xml仅新增updateFields=true，页码域在Word打开时更新，渲染校验连续页码与总数。

包保留：除document.xml、其关系、core.xml、settings.xml和被替换图像外，其余原包字节完全保留；不重写styles、theme、numbering、fontTable、页脚或customXml。图像与旧正文超链接关系属于替换槽。保留清单见reference-package.json。

目检：原稿哈希与既有12页逐页验证报告一致，本次沿用该版式记录并重新审计包结构。成稿全部页面重新渲染目检，图表与权利要求另作清晰度核对。最终不得遗漏源段落、破坏页码或改变页边距。
