# 测试视觉模型 - Base64方式
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests
import base64

API_KEY = "sk-oeylqxanedjvgrdlcrtdfogtecfmmijijpnapdijryosfgsy"
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"

# 创建一个简单的测试图片（1x1像素的PNG）
# 实际使用时会是用户上传的图片
TEST_IMAGE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_vl2_base64():
    print("测试 DeepSeek-VL2 (Base64图片)")
    print("=" * 50)

    data = {
        "model": "deepseek-ai/deepseek-vl2",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "描述这张图片"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{TEST_IMAGE_B64}"}}
                ]
            }
        ],
        "max_tokens": 200
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    resp = requests.post(BASE_URL, headers=headers, json=data, timeout=30)
    result = resp.json()
    print("响应:", result)

def test_ocr_model():
    print("\n测试 DeepSeek-OCR")
    print("=" * 50)

    # OCR模型可能有不同的调用方式，先试试
    data = {
        "model": "deepseek-ai/DeepSeek-OCR",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "识别图中文字"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{TEST_IMAGE_B64}"}}
                ]
            }
        ],
        "max_tokens": 200
    }

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    resp = requests.post(BASE_URL, headers=headers, json=data, timeout=30)
    result = resp.json()
    print("响应:", result)

if __name__ == "__main__":
    test_vl2_base64()
    test_ocr_model()
