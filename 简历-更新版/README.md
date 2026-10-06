# 简历更新版（2026-10-06）

在原简历基础上**新增「项目经历 / Projects」板块**（「Hi学长！」项目），其余内容与原版保持一致，样式按原版复刻。

## 交付文件（直接可用）

| 文件 | 说明 |
|---|---|
| `Resume of Hanlin Zhu.pdf` | 英文简历（1 页，Computer Modern 字体，与原版样式一致） |
| `朱翰林的简历（中文）.pdf` | 中文简历（2 页：第 1 页与原版一致，第 2 页为新增的项目经历） |

> 原版文件未做任何改动，仍留在原处。

## 内容改动

1. 新增板块：
   - 英文版：**Projects** — "Hi Senior!" (hixuezhang.site) — Founder & Product Lead (Independent)，2026.09 – 至今，4 条要点
   - 中文版：**项目经历** — 独立产品「Hi学长！」（创始人 / 产品负责人），2026.09 - 至今，4 条要点（项目发起 / 产品设计 / 技术落地 / 开发方式）
2. 顺手修正的错字（原版笔误）：
   - PTE 60 (**Overall** Score)（原为 Ovreall）
   - **V-Ray**（原为 Vary）、**Lumion**（原为 lumion）
   - **作为**一名具有时代复合知识技能学子（原为「做为」）

## 文件结构

```
简历-更新版/
├── Resume of Hanlin Zhu.pdf      ← 交付：英文版
├── 朱翰林的简历（中文）.pdf        ← 交付：中文版
├── resume-en.pdf / resume-zh.pdf ← 构建产物（与交付同名文件内容一致）
├── resume-en.html / resume-zh.html ← 自包含网页版（字体、图片已内嵌，可直接浏览器打开）
├── templates/                    ← 模板（改文字改这里，占位符见下）
│   ├── resume-en.tpl.html
│   └── resume-zh.tpl.html
├── assets/                       ← 素材（字体 4 个 + 照片 + 键盘背景图）
└── build.py                      ← 构建脚本：模板 → 内嵌资源 HTML → Chrome 渲染 PDF
```

## 如何修改后重新生成

1. 编辑 `templates/*.tpl.html`（字体/图片用占位符：`__FONT_BOLD__`、`__IMG_PHOTO__` 等，构建时会替换成 base64）
2. 运行：`python build.py`（需装 Python 与 Chrome）
3. 生成物自动覆盖 `resume-*.pdf` 并复制为正式交付名

## 版式基准（供后续修改参考）

- 中文版：页面底色 `#5C6473`、卡片白底、标题条 `#5C6573`（高 23pt、右端圆头、左端贴页边）、正文 11pt / 行高 23pt、标题条文字 17pt 粗体、姓名 33pt
- 英文版：Latin Modern 字体（原版为 LaTeX Computer Modern）、页边距 50.4pt、正文 10pt / 行高 12pt
