# PDF多模态识别测试 - 探索最佳方案
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import base64
import requests
import fitz  # PyMuPDF

API_KEY = "sk-oeylqxanedjvgrdlcrtdfogtecfmmijijpnapdijryosfgsy"
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"
PDF_PATH = "F:/编程项目/0011/测试.pdf"

def pdf_page_to_base64(filepath, page_num=0, dpi=150):
    """将PDF指定页转为base64图片"""
    doc = fitz.open(filepath)
    page = doc[page_num]
    mat = fitz.Matrix(dpi/72, dpi/72)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()
    print(f"图片大小: {len(img_bytes)/1024:.1f} KB, 尺寸: {pix.width}x{pix.height}")
    return base64.b64encode(img_bytes).decode("utf-8")

def test_ocr_model(b64_image):
    """测试DeepSeek-OCR模型"""
    print("\n" + "="*60)
    print("方案1: DeepSeek-OCR 专用OCR模型")
    print("="*60)

    data = {
        "model": "deepseek-ai/DeepSeek-OCR",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                {"type": "text", "text": "识别图中所有文字，保持原格式"}
            ]
        }],
        "max_tokens": 4000
    }

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    resp = requests.post(BASE_URL, headers=headers, json=data, timeout=120)
    result = resp.json()

    if "choices" in result:
        print("✅ 成功!")
        print(result["choices"][0]["message"]["content"][:2000])
        return True
    else:
        print("❌ 失败:", result.get("message", result))
        return False

def test_vl2_model(b64_image):
    """测试DeepSeek-VL2模型"""
    print("\n" + "="*60)
    print("方案2: DeepSeek-VL2 视觉语言模型")
    print("="*60)

    data = {
        "model": "deepseek-ai/deepseek-vl2",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                {"type": "text", "text": "请用中文完整识别并输出图片中的所有文字内容，包括题目、公式、选项等，保持原有格式和结构。"}
            ]
        }],
        "max_tokens": 4000
    }

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    resp = requests.post(BASE_URL, headers=headers, json=data, timeout=120)
    result = resp.json()

    if "choices" in result:
        print("✅ 成功!")
        print(result["choices"][0]["message"]["content"][:2000])
        return True
    else:
        print("❌ 失败:", result.get("message", result))
        return False

def test_qwen_vl(b64_image):
    """测试Qwen2.5-VL模型"""
    print("\n" + "="*60)
    print("方案3: Qwen2.5-VL-72B 视觉模型")
    print("="*60)

    data = {
        "model": "Qwen/Qwen2.5-VL-72B-Instruct",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                {"type": "text", "text": "请完整识别并输出图片中的所有文字内容，包括题目、公式、选项等，保持原有格式。"}
            ]
        }],
        "max_tokens": 4000
    }

    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    resp = requests.post(BASE_URL, headers=headers, json=data, timeout=120)
    result = resp.json()

    if "choices" in result:
        print("✅ 成功!")
        print(result["choices"][0]["message"]["content"][:2000])
        return True
    else:
        print("❌ 失败:", result.get("message", result))
        return False

if __name__ == "__main__":
    print("正在处理PDF...")

    # 先看看PDF信息
    doc = fitz.open(PDF_PATH)
    print(f"PDF页数: {len(doc)}")
    page = doc[0]
    text = page.get_text()
    print(f"第1页提取文字长度: {len(text)}")
    if text.strip():
        print(f"提取到的文字前500字:\n{text[:500]}")
    doc.close()

    # 尝试不同DPI
    for dpi in [72, 100, 150]:
        print(f"\n--- 测试 DPI={dpi} ---")
        try:
            b64 = pdf_page_to_base64(PDF_PATH, page_num=0, dpi=dpi)
            print(f"Base64长度: {len(b64)}")

            if dpi == 150:  # 只用150dpi测试API
                test_ocr_model(b64)
                test_vl2_model(b64)
                test_qwen_vl(b64)
        except Exception as e:
            print(f"错误: {e}")
