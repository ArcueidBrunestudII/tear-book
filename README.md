# 📚 Tearbook - 智能学习拆解工具

<div align="center">

**逐字逐句拆解知识点，让学习更高效**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ArcueidBrunestudII/tear-book/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)

[📥 一键下载安装包](https://github.com/ArcueidBrunestudII/tear-book/releases/download/v1.0.0/Tearbook_1.0.0_x64-setup.exe) | [📖 使用文档](程序解读1.txt) | [🔧 维护指南](版本维护指南1.txt)

</div>

---

## ✨ 项目简介

**Tearbook (EduMind/EduFlow)** 是一款桌面端智能学习应用，专为本科及以上用户设计。它能够将文档、图片、PDF 等学习资料**逐字逐句拆解为结构化知识点**，而不是简单的 AI 总结。

### 核心理念
- 🎯 **完整保留细节**：不做"总结式缩写"，保留原文所有知识点
- 🔄 **增量处理**：支持分批识别，可随时暂停和继续
- 💾 **跨平台续跑**：使用 `.zsd` 格式保存进度，可在不同电脑上继续处理
- 🎨 **优雅交互**：类 Windows 11 桌面风格，拖拽即用

---

## 🚀 快速开始

### 方式一：一键安装（推荐）

**适合小白用户，无需任何配置**

1. 点击下方按钮下载安装包（Windows 64位）

   **[📥 下载 Tearbook_1.0.0_x64-setup.exe](https://github.com/ArcueidBrunestudII/tear-book/releases/download/v1.0.0/Tearbook_1.0.0_x64-setup.exe)**

2. 双击运行安装程序，跟随向导完成安装

3. 启动应用，在设置面板中输入你的 **SiliconFlow API Key**

4. 拖入文件，开始学习！

> **获取 API Key**：前往 [SiliconFlow](https://siliconflow.cn/) 注册并获取免费额度

---

### 方式二：从源码构建

适合开发者或想要自定义的用户

#### 环境要求
- Node.js 18+
- Rust 1.70+
- Tauri CLI

#### 构建步骤
```bash
# 克隆仓库
git clone https://github.com/ArcueidBrunestudII/tear-book.git
cd tear-book/EduMind/eduflow

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri dev

# 打包生成安装包
npm run tauri build
```

---

## 📋 主要功能

### 1️⃣ 多格式支持
- 📄 纯文本：`.txt`、`.md`
- 📑 PDF 文档：文字型 / 扫描件（自动 OCR）
- 🖼️ 图片：`.png`、`.jpg`、`.jpeg`（支持公式识别）
- 💾 续跑格式：`.zsd`（跨机器可恢复进度）

### 2️⃣ 应用化管理
每个文件生成一个"应用图标"（类似桌面快捷方式）：
- 🎨 **自定义图标和名称**
- 📊 **双进度条显示**：
  - 🟢 绿条：文件读取进度（PDF 按页数、图片按张数）
  - 🔵 蓝条：知识点提取进度（可设置每批目标数量）
- 🔄 **增量识别**：点击 `>` 按钮继续处理下一批
- 📁 **右键菜单**：重命名 / 更换图标 / 查看属性 / 删除

### 3️⃣ 知识点管理
- 📚 **分层级结构**：支持多级知识点嵌套
- ✅ **启用 / 禁用**：可勾选需要的知识点
- ✏️ **编辑和删除**：自由调整知识点内容
- 🔍 **详情查看**：查看完整知识点描述

### 4️⃣ 智能增量处理
- 🎯 设置每批识别的知识点数量（如 10 条）
- 📖 自动读取文件单位（PDF 1 页 / 图片 1 张 / 文本 1 段）
- 🔄 缓存文本并提取知识点，不足则继续读取下一单位
- 💾 每批结束自动保存为 `.zsd` 格式（本地路径时）

---

## 🛠️ 技术栈

- **前端框架**：React 18 + TypeScript + Vite
- **桌面框架**：Tauri 2.0（Rust 后端）
- **状态管理**：Zustand
- **AI 模型**：SiliconFlow API
  - 文本：DeepSeek-V3
  - 视觉 / OCR：DeepSeek-OCR / Qwen2.5-VL
- **样式**：CSS3 动画（流畅的类 Windows 11 UI）

---

## 📦 文件结构

```
EduMind/eduflow/
├── src/                          # 前端源码
│   ├── components/               # React 组件
│   │   ├── Canvas/              # 主画布（文件拖拽 + 应用网格）
│   │   ├── AppIcon.tsx          # 应用图标
│   │   ├── SettingsPanel.tsx    # 设置面板
│   │   ├── KnowledgeTree.tsx    # 知识点树
│   │   └── ...
│   ├── services/                # 业务逻辑
│   │   ├── siliconflow.ts       # API 调用（含重试机制）
│   │   ├── fileUtils.ts         # 文件处理
│   │   ├── questionGenerator.ts # 题目生成
│   │   └── zsd.ts               # .zsd 格式处理
│   ├── stores/                  # Zustand 状态管理
│   └── styles/                  # 全局样式
├── src-tauri/                   # Tauri 后端
│   ├── src/main.rs             # Rust 主逻辑
│   └── tauri.conf.json         # Tauri 配置
└── public/                      # 静态资源
```

---

## 🎯 使用场景

- 📚 **文献阅读**：上传大量 PDF 论文，自动提取关键知识点
- 📖 **教材学习**：拆解教科书章节，建立知识体系
- 🖼️ **图片笔记**：OCR 识别手写 / 印刷笔记，转为可编辑文本
- 🔄 **跨设备学习**：在实验室处理一半，回宿舍继续（.zsd 格式）

---

## 📝 版本记录

### v1.0.0 (2025-12-18)
- ✅ 核心功能完成：多格式文件处理、增量识别、.zsd 保存
- ✅ 安全优化：CSP 策略、文件系统权限限制
- ✅ 稳定性提升：API 重试机制、JSON 解析增强
- ✅ 代码重构：Canvas 模块化拆分（1153 行 → 5 个模块）

详见 [版本维护指南](版本维护指南1.txt)

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

开发前请阅读：
- [程序解读1.txt](程序解读1.txt) - 项目架构说明
- [版本维护指南1.txt](版本维护指南1.txt) - 优化内容清单

---

## 📄 开源协议

本项目采用 MIT 协议开源。

---

## 🙏 致谢

- [Tauri](https://tauri.app/) - 高性能桌面应用框架
- [SiliconFlow](https://siliconflow.cn/) - 提供 AI 模型 API
- [DeepSeek](https://www.deepseek.com/) - 强大的文本和视觉模型

---

<div align="center">

**如果这个项目对你有帮助，请点个 ⭐ Star 支持一下！**

[报告问题](https://github.com/ArcueidBrunestudII/tear-book/issues) · [功能建议](https://github.com/ArcueidBrunestudII/tear-book/issues/new)

</div>
