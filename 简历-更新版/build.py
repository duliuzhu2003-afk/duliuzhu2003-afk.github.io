# 构建脚本：把字体/图片以 base64 内嵌进 HTML（生成自包含、可离线打开的文件）
# 用法：python build.py
import base64
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
TPL = os.path.join(BASE, "templates")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def data_uri(path, mime):
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()


SUBS = {
    "__FONT_REGULAR__": data_uri(os.path.join(ASSETS, "lmroman10-regular.otf"), "font/otf"),
    "__FONT_BOLD__": data_uri(os.path.join(ASSETS, "lmroman10-bold.otf"), "font/otf"),
    "__FONT_ITALIC__": data_uri(os.path.join(ASSETS, "lmroman10-italic.otf"), "font/otf"),
    "__FONT_BOLD12__": data_uri(os.path.join(ASSETS, "lmroman12-bold.otf"), "font/otf"),
    "__IMG_PHOTO__": data_uri(os.path.join(ASSETS, "photo.jpg"), "image/jpeg"),
    "__IMG_BG__": data_uri(os.path.join(ASSETS, "bg-header.jpg"), "image/jpeg"),
}

for name in ("resume-en", "resume-zh"):
    with open(os.path.join(TPL, name + ".tpl.html"), encoding="utf-8") as f:
        html = f.read()
    for key, val in SUBS.items():
        html = html.replace(key, val)
    out_html = os.path.join(BASE, name + ".html")
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"已生成 HTML: {out_html} ({os.path.getsize(out_html) // 1024}KB)")

    # 用 Chrome 无头模式渲染为 PDF
    out_pdf = os.path.join(BASE, name + ".pdf")
    file_url = "file:///" + out_html.replace("\\", "/").replace(" ", "%20").replace("！", "%EF%BC%81")
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
           f"--print-to-pdf={out_pdf}", file_url]
    r = subprocess.run(cmd, capture_output=True, timeout=180)
    if os.path.exists(out_pdf):
        print(f"已生成 PDF : {out_pdf} ({os.path.getsize(out_pdf) // 1024}KB)")
    else:
        print("PDF 生成失败! stderr:", r.stderr.decode(errors="ignore")[-500:])
        sys.exit(1)

# 复制为正式交付文件名（可直接用于投递）
import shutil
deliver = {
    "resume-en.pdf": "Resume of Hanlin Zhu.pdf",
    "resume-zh.pdf": "朱翰林的简历（中文）.pdf",
}
for src, dst in deliver.items():
    shutil.copyfile(os.path.join(BASE, src), os.path.join(BASE, dst))
    print(f"交付文件: {dst}")
