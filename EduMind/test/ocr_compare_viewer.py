# PDF识别结果对比查看器
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import tkinter as tk
from tkinter import ttk, scrolledtext
import base64
import requests
import fitz
import tempfile
import os

# 尝试导入matplotlib用于渲染公式
try:
    import matplotlib
    matplotlib.use('TkAgg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    from matplotlib.figure import Figure
    HAS_MATPLOTLIB = True
except:
    HAS_MATPLOTLIB = False

API_KEY = "sk-oeylqxanedjvgrdlcrtdfogtecfmmijijpnapdijryosfgsy"
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"
PDF_PATH = "F:/编程项目/0011/测试.pdf"

class OCRCompareApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PDF识别对比 - DeepSeek-OCR vs Qwen2.5-VL")
        self.root.geometry("1400x900")

        self.ocr_result = ""
        self.qwen_result = ""

        self.setup_ui()

    def setup_ui(self):
        # 顶部控制栏
        ctrl_frame = ttk.Frame(self.root, padding=10)
        ctrl_frame.pack(fill=tk.X)

        ttk.Button(ctrl_frame, text="开始识别PDF", command=self.start_recognition).pack(side=tk.LEFT, padx=5)
        ttk.Button(ctrl_frame, text="渲染公式预览", command=self.render_formulas).pack(side=tk.LEFT, padx=5)

        self.status_var = tk.StringVar(value="点击'开始识别PDF'")
        ttk.Label(ctrl_frame, textvariable=self.status_var).pack(side=tk.LEFT, padx=20)

        # 主内容区 - 左右对比
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 左边: DeepSeek-OCR
        left_frame = ttk.LabelFrame(main_frame, text="DeepSeek-OCR 结果", padding=5)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0,5))

        self.ocr_text = scrolledtext.ScrolledText(left_frame, wrap=tk.WORD, font=("Consolas", 10))
        self.ocr_text.pack(fill=tk.BOTH, expand=True)

        # 右边: Qwen2.5-VL
        right_frame = ttk.LabelFrame(main_frame, text="Qwen2.5-VL-72B 结果", padding=5)
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5,0))

        self.qwen_text = scrolledtext.ScrolledText(right_frame, wrap=tk.WORD, font=("Consolas", 10))
        self.qwen_text.pack(fill=tk.BOTH, expand=True)

        # 底部: 公式渲染区
        self.formula_frame = ttk.LabelFrame(self.root, text="公式渲染预览 (点击'渲染公式预览')", padding=5)
        self.formula_frame.pack(fill=tk.X, padx=10, pady=(0,10))

        self.formula_canvas_frame = ttk.Frame(self.formula_frame)
        self.formula_canvas_frame.pack(fill=tk.X)

    def pdf_to_base64(self, dpi=150):
        doc = fitz.open(PDF_PATH)
        page = doc[0]
        mat = fitz.Matrix(dpi/72, dpi/72)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        doc.close()
        return base64.b64encode(img_bytes).decode("utf-8")

    def call_ocr(self, b64_image):
        data = {
            "model": "deepseek-ai/DeepSeek-OCR",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                    {"type": "text", "text": "请完整识别图片中的所有文字和公式，保持原有格式结构。公式请用LaTeX格式输出。"}
                ]
            }],
            "max_tokens": 8000
        }
        headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        resp = requests.post(BASE_URL, headers=headers, json=data, timeout=180)
        result = resp.json()
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        else:
            return f"错误: {result.get('message', result)}"

    def call_qwen(self, b64_image):
        data = {
            "model": "Qwen/Qwen2.5-VL-72B-Instruct",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                    {"type": "text", "text": "请完整识别图片中的所有文字和公式，保持原有格式结构。公式请用LaTeX格式输出。"}
                ]
            }],
            "max_tokens": 8000
        }
        headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        resp = requests.post(BASE_URL, headers=headers, json=data, timeout=180)
        result = resp.json()
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        else:
            return f"错误: {result.get('message', result)}"

    def start_recognition(self):
        self.status_var.set("正在转换PDF...")
        self.root.update()

        try:
            b64 = self.pdf_to_base64()

            # 调用DeepSeek-OCR
            self.status_var.set("正在调用 DeepSeek-OCR...")
            self.root.update()
            self.ocr_result = self.call_ocr(b64)
            self.ocr_text.delete(1.0, tk.END)
            self.ocr_text.insert(tk.END, self.ocr_result)

            # 调用Qwen
            self.status_var.set("正在调用 Qwen2.5-VL-72B...")
            self.root.update()
            self.qwen_result = self.call_qwen(b64)
            self.qwen_text.delete(1.0, tk.END)
            self.qwen_text.insert(tk.END, self.qwen_result)

            self.status_var.set("识别完成! 可点击'渲染公式预览'查看公式效果")

        except Exception as e:
            self.status_var.set(f"错误: {e}")

    def render_formulas(self):
        if not HAS_MATPLOTLIB:
            self.status_var.set("需要安装matplotlib: pip install matplotlib")
            return

        # 清空之前的渲染
        for widget in self.formula_canvas_frame.winfo_children():
            widget.destroy()

        # 从OCR结果中提取一些公式进行渲染
        import re
        # 匹配 \(...\) 或 $...$ 格式的公式
        formulas = re.findall(r'\\\((.*?)\\\)|\$([^$]+)\$', self.ocr_result)
        formulas = [f[0] or f[1] for f in formulas][:8]  # 最多显示8个

        if not formulas:
            # 尝试匹配其他格式
            formulas = re.findall(r'\\frac\{[^}]+\}\{[^}]+\}|E_\d\s*=\s*[^,\n]+', self.ocr_result)[:8]

        if not formulas:
            self.status_var.set("未找到可渲染的LaTeX公式")
            return

        # 创建matplotlib图形
        fig = Figure(figsize=(14, 2), dpi=100)

        for i, formula in enumerate(formulas[:4]):
            ax = fig.add_subplot(1, 4, i+1)
            ax.axis('off')
            try:
                # 清理公式
                formula = formula.strip()
                ax.text(0.5, 0.5, f"${formula}$", fontsize=12, ha='center', va='center',
                       transform=ax.transAxes)
            except:
                ax.text(0.5, 0.5, "[渲染失败]", fontsize=10, ha='center', va='center')

        fig.tight_layout()

        canvas = FigureCanvasTkAgg(fig, master=self.formula_canvas_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill=tk.X)

        self.status_var.set(f"已渲染 {min(len(formulas), 4)} 个公式")


if __name__ == "__main__":
    root = tk.Tk()
    app = OCRCompareApp(root)
    root.mainloop()
