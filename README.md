# AI-Reeeeesume
# AI 简历助手

让 AI 辅助制作你的个人简历。使用 DeepSeek API 进行对话式信息收集、智能润色与排版，支持语音畅聊，一键导出 Word。

[![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js)](https://vuejs.org/)
[![Vant](https://img.shields.io/badge/Vant-4.x-00BFFF?logo=vant)](https://vant-ui.github.io/)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-API-6C8EB2)](https://www.deepseek.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

## 功能特点

对话式简历构建  
像聊天一样与 AI 交流，AI 会主动引导你补充工作经历、项目、技能等，并追问量化成果和具体细节。

JD 智能分析  
粘贴职位描述，AI 自动提取核心关键词和能力要求，在对话中定向引导你匹配 JD 需求。

实时模板生成  
AI 直接生成适合手机浏览的 HTML 简历模板，支持自定义主色调、字体风格，所见即所得。

语音畅聊模式  
一键切换免提连续对话，无需手动操作，AI 自动聆听、思考、回答，适合驾驶或忙时使用。

内容润色与手动编辑  
支持 JSON 格式手动编辑简历，一键调用 AI 润色表达，支持更换模板风格。

草稿保存与恢复  
本地存储对话进度和简历数据，随时载入继续编辑。

导出 Word 文档  
一键将预览的简历导出为 .docx 文件，直接用于投递。

## 技术栈

前端框架：Vue 3 (Composition API)  
UI 组件库：Vant 4 (移动端友好)  
HTTP 请求：Axios  
语音能力：讯飞语音云 (ASR + TTS) + WebSocket + Web Crypto  
AI 模型：DeepSeek Chat API  
文档导出：html-docx-js  
构建方式：纯前端，无构建工具，直接运行

## 项目结构
.
├── index.html # 入口页面
├── css/
│ └── style.css # 全局样式（含语音模式样式）
├── js/
│ ├── app.js # 主应用逻辑
│ ├── color-wheel-picker.js # HSL 色环选择器组件
│ ├── progress-bar.js # 进度条模拟组件
│ ├── xunfei-voice.js # 讯飞语音 ASR / TTS 封装
│ └── voice-chat-mode.js # 语音畅聊模式模块
├── config/
│ └── api-config.json # API 配置文件（需自行创建）
└── README.md

text

## 快速开始

### 1. 获取 API 密钥

DeepSeek API Key  
访问 DeepSeek 开放平台注册并创建 API Key。

讯飞语音 API  
访问讯飞开放平台创建应用，获取 appid、apiKey、apiSecret。

### 2. 创建配置文件

在项目 `config/` 目录下新建 `api-config.json`，格式如下：

```json
{
  "deepseek": {
    "key": "sk-你的DeepSeek密钥",
    "url": "https://api.deepseek.com/v1/chat/completions",
    "model": "deepseek-chat"
  },
  "xunfei": {
    "appid": "你的讯飞AppID",
    "apiKey": "你的讯飞ApiKey",
    "apiSecret": "你的讯飞ApiSecret"
  }
}

3. 运行项目
项目为纯静态页面，直接使用任意 HTTP 服务器运行即可。
```
bash
# 使用 Python 3
python -m http.server 8080

# 或使用 Node.js 的 serve
npx serve .
然后在浏览器中打开 http://localhost:8080。

注意：由于使用了 Web Crypto API 和麦克风权限，请确保页面在 https 或 localhost 环境下运行。

使用指南
第一步：填写基本信息
输入姓名、求职意向、邮箱、电话。可选粘贴职位描述，点击「分析 JD」让 AI 提取关键要求。

第二步：AI 对话收集
在文字模式下，通过键盘或语音（点击麦克风）与 AI 交流。点击顶部「语音畅聊」按钮可切换至免提连续对话模式，此时将显示巨大状态指示器，自动循环聆听与回答。可随时点击「打断」按钮中断当前说话或思考。

第三步：预览与调整
完成信息收集后进入预览页面。可调整主色调、字体风格。点击「编辑 JSON」可手动修改简历数据，支持润色内容或更换模板。

第四步：导出
满意后点击「导出 DOCX」下载 Word 版简历。

语音畅聊模式说明
该模式专为“放下手机，专注表达”设计。

自动轮转
聆听 → AI 思考 → 语音回答 → 再次聆听，全程无需手动操作。

巨大状态指示器
清晰展示当前状态（聆听中 / 思考中 / 说话中）。

打断功能
可随时打断 AI 说话，直接进入下一轮聆听。

推荐佩戴耳机
避免 AI 播报的声音被麦克风录入造成回声。

注意事项
API 密钥安全
api-config.json 直接暴露在前端，仅供本地或个人测试使用。如需公开部署，请务必将 API 调用移至后端服务进行代理。

浏览器兼容性
推荐使用 Chrome / Edge 等现代浏览器，Safari 需注意 AudioContext 自动播放策略。

语音功能依赖
语音识别与合成依赖讯飞 WebAPI，请确保网络通畅且配置正确。

开源协议
本项目基于 MIT 协议开源，欢迎自由使用、修改和分发。

致谢
DeepSeek 提供强大的 AI 对话模型
讯飞开放平台 提供优秀的语音识别与合成服务
Vant 提供轻量可靠的移动端组件库

祝你求职顺利！
