# EduMind 聊天原型
# 功能: 选择模型、发送消息、上传文件(图片/txt/pdf)

import sys
import os
import base64
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
import requests

# PDF支持(可选)
try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

API_KEY = "sk-oeylqxanedjvgrdlcrtdfogtecfmmijijpnapdijryosfgsy"
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"

# 可用模型列表
MODELS = {
    "DeepSeek-V3.2 (最新)": "deepseek-ai/DeepSeek-V3.2",
    "DeepSeek-V3": "deepseek-ai/DeepSeek-V3",
    "DeepSeek-R1 (推理)": "deepseek-ai/DeepSeek-R1",
    "DeepSeek-VL2 (视觉)": "deepseek-ai/deepseek-vl2",
    "DeepSeek-OCR": "deepseek-ai/DeepSeek-OCR",
}

class ChatApp:
    def __init__(self, root):
        self.root = root
        self.root.title("EduMind - 聊天原型")
        self.root.geometry("900x700")

        self.conversation = []  # 对话历史
        self.attached_files = []  # 当前附件

        self.setup_ui()

    def setup_ui(self):
        # 顶部: 模型选择
        top_frame = ttk.Frame(self.root, padding=10)
        top_frame.pack(fill=tk.X)

        ttk.Label(top_frame, text="模型:").pack(side=tk.LEFT)
        self.model_var = tk.StringVar(value="DeepSeek-V3.2 (最新)")
        model_combo = ttk.Combobox(top_frame, textvariable=self.model_var,
                                   values=list(MODELS.keys()), width=25, state="readonly")
        model_combo.pack(side=tk.LEFT, padx=5)

        ttk.Button(top_frame, text="清空对话", command=self.clear_chat).pack(side=tk.RIGHT)

        # 中部: 聊天记录
        chat_frame = ttk.Frame(self.root, padding=10)
        chat_frame.pack(fill=tk.BOTH, expand=True)

        self.chat_display = scrolledtext.ScrolledText(chat_frame, wrap=tk.WORD,
                                                       font=("Microsoft YaHei", 10))
        self.chat_display.pack(fill=tk.BOTH, expand=True)
        self.chat_display.config(state=tk.DISABLED)

        # 附件显示区
        self.attach_frame = ttk.Frame(self.root, padding=5)
        self.attach_frame.pack(fill=tk.X)
        self.attach_label = ttk.Label(self.attach_frame, text="")
        self.attach_label.pack(side=tk.LEFT)

        # 底部: 输入区
        input_frame = ttk.Frame(self.root, padding=10)
        input_frame.pack(fill=tk.X)

        ttk.Button(input_frame, text="📎 上传文件", command=self.upload_file).pack(side=tk.LEFT)

        self.input_text = tk.Text(input_frame, height=3, font=("Microsoft YaHei", 10))
        self.input_text.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=10)
        self.input_text.bind("<Return>", self.on_enter)
        self.input_text.bind("<Shift-Return>", lambda e: None)  # Shift+Enter换行

        self.send_btn = ttk.Button(input_frame, text="发送", command=self.send_message)
        self.send_btn.pack(side=tk.RIGHT)

    def upload_file(self):
        filetypes = [
            ("所有支持的文件", "*.txt;*.png;*.jpg;*.jpeg;*.pdf"),
            ("文本文件", "*.txt"),
            ("图片", "*.png;*.jpg;*.jpeg"),
            ("PDF", "*.pdf"),
        ]
        filepath = filedialog.askopenfilename(filetypes=filetypes)
        if filepath:
            self.attached_files.append(filepath)
            names = [os.path.basename(f) for f in self.attached_files]
            self.attach_label.config(text=f"附件: {', '.join(names)}")

    def clear_chat(self):
        self.conversation = []
        self.attached_files = []
        self.attach_label.config(text="")
        self.chat_display.config(state=tk.NORMAL)
        self.chat_display.delete(1.0, tk.END)
        self.chat_display.config(state=tk.DISABLED)

    def on_enter(self, event):
        if not event.state & 0x1:  # 没按Shift
            self.send_message()
            return "break"

    def append_chat(self, role, content):
        self.chat_display.config(state=tk.NORMAL)
        if role == "user":
            self.chat_display.insert(tk.END, f"\n你: {content}\n", "user")
        else:
            self.chat_display.insert(tk.END, f"\nAI: {content}\n", "ai")
        self.chat_display.see(tk.END)
        self.chat_display.config(state=tk.DISABLED)

    def send_message(self):
        user_input = self.input_text.get(1.0, tk.END).strip()
        if not user_input and not self.attached_files:
            return

        self.input_text.delete(1.0, tk.END)
        self.send_btn.config(state=tk.DISABLED)

        # 显示用户消息
        display_text = user_input
        if self.attached_files:
            names = [os.path.basename(f) for f in self.attached_files]
            display_text += f"\n[附件: {', '.join(names)}]"
        self.append_chat("user", display_text)

        # 异步发送
        threading.Thread(target=self.call_api, args=(user_input,), daemon=True).start()

    def call_api(self, user_input):
        try:
            model_name = self.model_var.get()
            model_id = MODELS[model_name]
            is_vision = "vl2" in model_id.lower() or "ocr" in model_id.lower()

            # 检查是否有扫描PDF需要强制使用视觉模型
            has_scan_pdf = False
            for filepath in self.attached_files:
                if filepath.lower().endswith(".pdf"):
                    text = self.read_pdf_file(filepath)
                    if text is None:
                        has_scan_pdf = True
                        break

            # 如果有扫描PDF但没选视觉模型，自动切换
            if has_scan_pdf and not is_vision:
                model_id = "deepseek-ai/deepseek-vl2"
                is_vision = True
                self.root.after(0, lambda: self.append_chat("ai", "[检测到扫描PDF，自动切换到VL2视觉模型]"))

            # 构建消息内容
            content = self.build_content(user_input, is_vision)

            headers = {
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            }

            # 视觉模型不支持带图片的多轮对话，只发当前消息
            if is_vision:
                messages = [{"role": "user", "content": content}]
            else:
                # 文本模型可以用对话历史
                self.conversation.append({"role": "user", "content": content})
                messages = self.conversation

            data = {
                "model": model_id,
                "messages": messages,
                "max_tokens": 4000,
                "stream": False
            }

            resp = requests.post(BASE_URL, headers=headers, json=data, timeout=120)
            result = resp.json()

            if "choices" in result:
                ai_response = result["choices"][0]["message"]["content"]
                # 只有文本模型才保存历史
                if not is_vision:
                    self.conversation.append({"role": "assistant", "content": ai_response})
                self.root.after(0, lambda: self.append_chat("ai", ai_response))
            else:
                error_msg = result.get("message", str(result))
                self.root.after(0, lambda: self.append_chat("ai", f"[错误] {error_msg}"))

        except Exception as e:
            self.root.after(0, lambda: self.append_chat("ai", f"[异常] {str(e)}"))

        finally:
            self.attached_files = []
            self.root.after(0, lambda: self.attach_label.config(text=""))
            self.root.after(0, lambda: self.send_btn.config(state=tk.NORMAL))

    def build_content(self, user_input, is_vision):
        """构建API消息内容,处理附件"""

        if not self.attached_files:
            return user_input

        # 检查是否有PDF需要视觉处理
        has_scan_pdf = False
        for filepath in self.attached_files:
            if filepath.lower().endswith(".pdf"):
                text = self.read_pdf_file(filepath)
                if text is None:  # 扫描件
                    has_scan_pdf = True
                    break

        # 如果有扫描PDF，强制使用视觉模式
        if has_scan_pdf:
            is_vision = True

        # 有附件时
        if is_vision:
            # 视觉模型: 使用多模态格式，强制中文回复
            prompt = user_input + "\n(请用中文回答)"
            content = [{"type": "text", "text": prompt}]
            for filepath in self.attached_files:
                ext = os.path.splitext(filepath)[1].lower()
                if ext in [".png", ".jpg", ".jpeg"]:
                    b64 = self.file_to_base64(filepath)
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/{ext[1:]};base64,{b64}"}
                    })
                elif ext == ".txt":
                    text = self.read_text_file(filepath)
                    content[0]["text"] += f"\n\n[文件内容: {os.path.basename(filepath)}]\n{text}"
                elif ext == ".pdf":
                    text = self.read_pdf_file(filepath)
                    if text:  # 有文字的PDF
                        content[0]["text"] += f"\n\n[PDF内容: {os.path.basename(filepath)}]\n{text}"
                    else:  # 扫描件，转图片
                        images = self.pdf_to_images_base64(filepath)
                        content[0]["text"] += f"\n\n[PDF扫描件: {os.path.basename(filepath)}, 共{len(images)}页]"
                        for b64 in images:
                            content.append({
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                            })
            return content
        else:
            # 纯文本模型: 把所有内容转成文本
            text_parts = [user_input]
            for filepath in self.attached_files:
                ext = os.path.splitext(filepath)[1].lower()
                if ext == ".txt":
                    text = self.read_text_file(filepath)
                    text_parts.append(f"\n[文件: {os.path.basename(filepath)}]\n{text}")
                elif ext == ".pdf":
                    text = self.read_pdf_file(filepath)
                    if text:
                        text_parts.append(f"\n[PDF: {os.path.basename(filepath)}]\n{text}")
                    else:
                        text_parts.append(f"\n[PDF扫描件: {os.path.basename(filepath)} - 请切换到视觉模型(VL2/OCR)查看]")
                elif ext in [".png", ".jpg", ".jpeg"]:
                    text_parts.append(f"\n[图片: {os.path.basename(filepath)} - 请切换到视觉模型查看]")
            return "".join(text_parts)

    def file_to_base64(self, filepath):
        with open(filepath, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    def read_text_file(self, filepath):
        encodings = ["utf-8", "gbk", "gb2312", "latin-1"]
        for enc in encodings:
            try:
                with open(filepath, "r", encoding=enc) as f:
                    return f.read()
            except:
                continue
        return "[无法读取文件]"

    def read_pdf_file(self, filepath):
        """读取PDF，返回文本。如果是扫描件则返回None"""
        if not PDF_SUPPORT:
            return "[需要安装PyMuPDF: pip install pymupdf]"
        try:
            doc = fitz.open(filepath)
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())
            doc.close()
            text = "\n".join(text_parts).strip()
            if len(text) < 20:  # 文字太少，可能是扫描件
                return None
            return text
        except Exception as e:
            return f"[PDF读取错误: {e}]"

    def pdf_to_images_base64(self, filepath, max_pages=3):
        """将PDF转为图片base64列表（用于扫描件）"""
        if not PDF_SUPPORT:
            return []
        try:
            doc = fitz.open(filepath)
            images = []
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                # 渲染为图片，降低分辨率到100dpi以减少token
                mat = fitz.Matrix(100/72, 100/72)
                pix = page.get_pixmap(matrix=mat)
                # 转为JPEG减小体积
                img_bytes = pix.tobytes("jpeg")
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                images.append(b64)
            doc.close()
            return images
        except Exception as e:
            return []


if __name__ == "__main__":
    root = tk.Tk()
    app = ChatApp(root)
    root.mainloop()
