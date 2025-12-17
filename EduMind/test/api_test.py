# 硅基流动 API 测试脚本
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests

API_KEY = "sk-oeylqxanedjvgrdlcrtdfogtecfmmijijpnapdijryosfgsy"
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# 测试1: DeepSeek-V3 文本理解
def test_text_model():
    print("=" * 50)
    print("测试1: DeepSeek-V3 文本模型")
    print("=" * 50)

    data = {
        "model": "deepseek-ai/DeepSeek-V3",
        "messages": [
            {"role": "user", "content": "请将以下内容拆分成知识点并用JSON格式输出：\n\n牛顿第一定律：一切物体在没有受到力的作用时，总保持静止状态或匀速直线运动状态。牛顿第二定律：物体的加速度与作用力成正比，与物体质量成反比，公式为F=ma。"}
        ],
        "max_tokens": 500
    }

    try:
        resp = requests.post(BASE_URL, headers=headers, json=data, timeout=30)
        result = resp.json()
        if "choices" in result:
            print("✅ 成功!")
            print(result["choices"][0]["message"]["content"])
        else:
            print("❌ 失败:", result)
    except Exception as e:
        print("❌ 错误:", e)

# 测试2: DeepSeek-VL2 视觉模型
def test_vision_model():
    print("\n" + "=" * 50)
    print("测试2: DeepSeek-VL2 视觉模型")
    print("=" * 50)

    # 用一个公开图片URL测试
    data = {
        "model": "deepseek-ai/deepseek-vl2",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "这张图片里有什么？"},
                    {"type": "image_url", "image_url": {"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg"}}
                ]
            }
        ],
        "max_tokens": 200
    }

    try:
        resp = requests.post(BASE_URL, headers=headers, json=data, timeout=30)
        result = resp.json()
        if "choices" in result:
            print("✅ 成功!")
            print(result["choices"][0]["message"]["content"])
        else:
            print("❌ 失败:", result)
    except Exception as e:
        print("❌ 错误:", e)

# 测试3: 列出可用模型
def test_list_models():
    print("\n" + "=" * 50)
    print("测试3: 查询可用模型列表")
    print("=" * 50)

    try:
        resp = requests.get(
            "https://api.siliconflow.cn/v1/models",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=15
        )
        result = resp.json()
        if "data" in result:
            print("✅ 成功! 部分可用模型:")
            models = [m["id"] for m in result["data"]]
            # 筛选DeepSeek相关
            deepseek_models = [m for m in models if "deepseek" in m.lower()]
            for m in deepseek_models[:15]:
                print(f"  - {m}")
            print(f"  ... 共 {len(models)} 个模型")
        else:
            print("❌ 失败:", result)
    except Exception as e:
        print("❌ 错误:", e)

if __name__ == "__main__":
    test_list_models()
    test_text_model()
    test_vision_model()
