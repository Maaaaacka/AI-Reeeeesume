// ---------- 配置 ----------
const API_CONFIG = {
  key: 'sk-4132cc3b3be345b0b4ea89ea30af6bb5',
  url: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat'
};

const EMPTY_RESUME = {
  personal: { name: '', jobTitle: '', email: '', phone: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: []
};

// ---------- 工具函数 ----------
const utils = {
  async callAPI(messages, temperature = 0.7, jsonMode = false) {
    const body = {
      model: API_CONFIG.model,
      messages: messages,
      temperature: temperature,
      stream: false,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    try {
      const response = await axios.post(API_CONFIG.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.key}`
        }
      });
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('API调用失败', error);
      throw error;
    }
  },
};

// 检测硬编码颜色
const hasHardcodedColors = (html) => {
  const colorRegex = /#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;
  return colorRegex.test(html);
};

// ---------- AI 服务 ----------
const aiService = {
  async generateFirstQuestion(resumeData) {
    const prompt = `你是一个简历构建助手。目前用户已经提供了基本信息：姓名 ${resumeData.personal.name}，求职意向 ${resumeData.personal.jobTitle}，邮箱 ${resumeData.personal.email}，电话 ${resumeData.personal.phone}。请基于此，提出一个友好、开放的问题来收集更多简历相关的内容，例如工作经历、项目、技能或教育背景。问题要简洁自然，适合聊天。直接返回问题文本，不要带额外符号。`;
    try {
      return await utils.callAPI([{ role: 'user', content: prompt }], 0.7);
    } catch (e) {
      return '可以介绍一下你的工作经历吗？从最近的开始。';
    }
  },

  async processUserAnswer(resumeData, messages) {
    const systemPrompt = `你是一个简历助手。当前简历（JSON格式）如下：
${JSON.stringify(resumeData, null, 2)}

请根据对话历史，尤其是用户的最后一次回答，更新简历内容。然后提出下一个问题以收集更多信息（如果简历已完整则next_question设为null）。

你必须以JSON格式回复，包含两个字段：
- "resume": 更新后的完整简历对象 (遵循现有结构)
- "next_question": 下一个问题字符串，或null

只输出JSON，不要有任何其他文字。`;
    const history = messages.slice(-6).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content
    }));
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];
    try {
      const aiReply = await utils.callAPI(fullMessages, 0.5, true);
      try {
        return JSON.parse(aiReply);
      } catch (e) {
        console.warn('AI返回非JSON，尝试提取', aiReply);
        return {
          resume: {
            ...resumeData,
            summary: (resumeData.summary || '') + ' ' + messages[messages.length - 1].content
          },
          next_question: '继续说说你的其他经历？'
        };
      }
    } catch (error) {
      throw new Error('处理回答时出错');
    }
  },

  async generateTemplate(resumeData, customPrompt = '', primaryColor = '#2970ff', fontFamily = 'system') {
    const fontMap = {
      system: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
      sans: 'Helvetica, Arial, sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      mono: '"Courier New", monospace'
    };
    const fontDesc = fontMap[fontFamily] || fontMap.system;
    const defaultDesc = '生成一个简洁专业、适合手机浏览的简历模板，使用卡片布局，浅色背景。';
    const finalPrompt = customPrompt.trim() || defaultDesc;

    const prompt = `你是一个专业的简历HTML模板生成器。根据以下简历数据，生成一份适合手机浏览的HTML简历模板。

重要规则（必须严格遵守）：
1. 所有样式必须通过CSS变量定义，绝对禁止硬编码颜色值（如 #2970ff、rgb(41,112,255) 等）。
2. 必须使用以下标准变量名（在 <style> 中定义）：
   --primary-color: 主色调（当前建议值：${primaryColor}，但必须通过变量引用）
   --font-family: 字体（当前建议：${fontDesc}，但必须通过变量引用）
   --bg-color: 页面背景色（必须为浅色，如白色或浅灰色，即使风格描述要求深色也要忽略）
   --card-bg: 卡片背景色（也应为浅色）
   --text-color: 正文颜色（应为深色，与浅色背景形成对比）
   --border-radius: 卡片圆角（建议使用较小的值，如4px）
   --box-shadow: 卡片阴影（由于Word不支持阴影，请将其设置为none，或使用边框代替）
3. 样式必须兼容 Microsoft Word 渲染引擎：
   - 避免使用 box-shadow, text-shadow, 复杂渐变, transform, flex/grid 复杂布局（可以用简单的块级元素和浮动）。
   - 使用边框（border）、背景色（background-color）、内边距（padding）来实现卡片效果。
   - 使用标准字体族（如 Arial, Times New Roman）。
4. 背景色强制为浅色：无论用户提供的风格描述如何，--bg-color 和 --card-bg 必须为浅色（如白色、浅灰）。任何深色背景要求都将被忽略。
5. 不要使用任何交互效果（:hover、transition、animation 等）。简历应为纯静态样式，适合打印和阅读。
6. 所有动态内容必须放在具有固定class的元素中，class命名规范如下：
   - 姓名：resume-name
   - 求职意向：resume-title
   - 联系方式：resume-contact
   - 摘要：resume-summary
   - 工作经历：每个经历放在 .resume-experience-item 中，其中职位用 .exp-title，公司用 .exp-company，日期用 .exp-date，描述用 .exp-desc。
   - 教育：类似经历，使用 .resume-edu-item，字段用 .edu-degree, .edu-school, .edu-date。
   - 技能：每个技能用 .resume-skill-item。
7. 直接返回完整HTML代码，不要Markdown，不要用代码块包裹。

风格要求：${finalPrompt}
简历数据：${JSON.stringify(resumeData)}`;

    try {
      return await utils.callAPI([{ role: 'user', content: prompt }], 0.6, false);
    } catch (e) {
      throw new Error('生成模板失败');
    }
  },

  async polishContent(resumeData) {
    const prompt = `你是一个简历内容润色专家。请优化以下简历的文本表达，使其更专业、简洁有力。不要改变任何数据结构（如数组长度、字段名），只修改字符串内容（如summary、职位描述、技能名称等）。以JSON格式返回完整的润色后简历。

原始简历：${JSON.stringify(resumeData)}`;
    try {
      const reply = await utils.callAPI([{ role: 'user', content: prompt }], 0.5, true);
      return JSON.parse(reply);
    } catch (e) {
      throw new Error('润色内容失败');
    }
  }
};

// ---------- Vue 应用 ----------
const { createApp, ref, reactive, nextTick, watch, onMounted } = Vue;

const app = createApp({
  setup() {
    // ---------- 状态 ----------
    const currentStep = ref(1);
    const resume = reactive({ ...EMPTY_RESUME });
    const basicForm = reactive({ name: '', jobTitle: '', email: '', phone: '' });
    const messages = ref([]);
    const userInput = ref('');
    const isWaitingAI = ref(false);
    const polishedHTML = ref('');
    const currentTemplate = ref('');
    const chatBox = ref(null);

    const customFont = ref('system');
    const customColor = ref('#2970ff');

    const showManualEdit = ref(false);
    const manualJSON = ref('');

    const templatePrompt = ref('');
    const presetDescs = [
      '经典商务风格，深蓝色调，简洁稳重，卡片有轻微阴影。',
      '现代清新风格，浅绿色为主，圆角卡片，留白较多，适合年轻岗位。',
      '科技感风格，浅色背景，霓虹蓝点缀，简洁现代。'
    ];

    const randomPreset = () => {
      const randomIndex = Math.floor(Math.random() * presetDescs.length);
      templatePrompt.value = presetDescs[randomIndex];
    };
    const setPreset = (index) => {
      templatePrompt.value = presetDescs[index];
    };

    const DRAFT_KEY = 'resume_assistant_draft';

    // ---------- 辅助函数 ----------
    const showToast = (message, type = 'text') => {
      if (window.vant?.showToast) {
        window.vant.showToast({ message, type });
      } else {
        alert(`[${type}] ${message}`);
      }
    };

    const updateCSSVariables = () => {
      document.documentElement.style.setProperty('--primary-color', customColor.value);
      const fontMap = {
        system: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
        sans: 'Helvetica, Arial, sans-serif',
        serif: 'Georgia, "Times New Roman", serif',
        mono: '"Courier New", monospace'
      };
      document.documentElement.style.setProperty('--font-family', fontMap[customFont.value] || fontMap.system);
    };
    watch([customColor, customFont], updateCSSVariables);

    const fillTemplateWithData = (templateHtml) => {
      if (!templateHtml) return '';
      const div = document.createElement('div');
      div.innerHTML = templateHtml;
      try {
        const nameEl = div.querySelector('.resume-name');
        if (nameEl) nameEl.textContent = resume.personal.name || '';
        const titleEl = div.querySelector('.resume-title');
        if (titleEl) titleEl.textContent = resume.personal.jobTitle || '';
        const contactEl = div.querySelector('.resume-contact');
        if (contactEl) contactEl.textContent = `${resume.personal.email || ''} | ${resume.personal.phone || ''}`;
        const summaryEl = div.querySelector('.resume-summary');
        if (summaryEl) summaryEl.textContent = resume.summary || '';

        const expItems = div.querySelectorAll('.resume-experience-item');
        resume.experience.forEach((exp, index) => {
          if (expItems[index]) {
            const item = expItems[index];
            const title = item.querySelector('.exp-title');
            if (title) title.textContent = exp.title || '';
            const company = item.querySelector('.exp-company');
            if (company) company.textContent = exp.company || '';
            const date = item.querySelector('.exp-date');
            if (date) date.textContent = exp.date || '';
            const desc = item.querySelector('.exp-desc');
            if (desc) desc.textContent = exp.description || '';
          }
        });

        const eduItems = div.querySelectorAll('.resume-edu-item');
        resume.education.forEach((edu, index) => {
          if (eduItems[index]) {
            const item = eduItems[index];
            const degree = item.querySelector('.edu-degree');
            if (degree) degree.textContent = edu.degree || '';
            const school = item.querySelector('.edu-school');
            if (school) school.textContent = edu.school || '';
            const date = item.querySelector('.edu-date');
            if (date) date.textContent = edu.date || '';
          }
        });

        const skillItems = div.querySelectorAll('.resume-skill-item');
        resume.skills.forEach((skill, index) => {
          if (skillItems[index]) skillItems[index].textContent = skill.name || skill;
        });
      } catch (e) {
        console.warn('填充模板出错', e);
      }
      return div.innerHTML;
    };

    const refreshPreview = () => {
      if (currentTemplate.value) {
        polishedHTML.value = fillTemplateWithData(currentTemplate.value);
      }
    };

    watch(resume, () => {
      if (currentStep.value === 3 && currentTemplate.value) {
        refreshPreview();
      }
    }, { deep: true });

    watch(messages, async () => {
      await nextTick();
      if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
    });

    const updatePersonalFromForm = () => {
      resume.personal = { ...basicForm };
    };

    const submitBasic = () => {
      if (!basicForm.name || !basicForm.jobTitle) {
        alert('请填写姓名和求职意向');
        return;
      }
      updatePersonalFromForm();
      currentStep.value = 2;
      startAIConversation();
    };

    const startAIConversation = async () => {
      messages.value = [];
      isWaitingAI.value = true;
      try {
        const firstQuestion = await aiService.generateFirstQuestion(resume);
        messages.value.push({ role: 'ai', content: firstQuestion });
      } catch (e) {
        messages.value.push({ role: 'ai', content: '你好！我是你的简历助手。可以告诉我更多关于你的工作经历吗？比如最近的一份工作？' });
      } finally {
        isWaitingAI.value = false;
      }
    };

    const sendAnswer = async () => {
      if (!userInput.value.trim() || isWaitingAI.value) return;
      const userMsg = userInput.value;
      messages.value.push({ role: 'user', content: userMsg });
      userInput.value = '';
      isWaitingAI.value = true;
      try {
        const result = await aiService.processUserAnswer(resume, messages.value);
        if (result.resume) Object.assign(resume, result.resume);
        const nextQ = result.next_question;
        if (nextQ && typeof nextQ === 'string') {
          messages.value.push({ role: 'ai', content: nextQ });
        } else {
          messages.value.push({ role: 'ai', content: '太棒了！我们已经收集了足够的信息。点击"下一步"生成简历模板。' });
        }
      } catch (error) {
        messages.value.push({ role: 'ai', content: '抱歉，我遇到点问题。不过你可以继续手动填写或者点击下一步。' });
      } finally {
        isWaitingAI.value = false;
      }
    };

    const goToPreview = async () => {
      currentStep.value = 3;
      isWaitingAI.value = true;
      try {
        const templateHtml = await aiService.generateTemplate(resume, '', customColor.value, customFont.value);
        let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
        if (hasHardcodedColors(cleanHtml)) {
          showToast('⚠️ 模板包含硬编码颜色，自定义颜色可能失效。建议重新生成。', 'fail');
        }
        currentTemplate.value = cleanHtml;
        refreshPreview();
        showToast('模板生成成功', 'success');
      } catch (e) {
        showToast('模板生成失败', 'fail');
      } finally {
        isWaitingAI.value = false;
      }
    };

    const openManualEdit = () => {
      manualJSON.value = JSON.stringify(resume, null, 2);
      showManualEdit.value = true;
    };
    const cancelManualEdit = () => {
      showManualEdit.value = false;
    };
    const applyManualEditOnly = () => {
      try {
        const newResume = JSON.parse(manualJSON.value);
        if (!newResume.personal || !Array.isArray(newResume.experience)) throw new Error('结构不完整');
        Object.assign(resume, newResume);
        showManualEdit.value = false;
        showToast('内容已更新', 'success');
      } catch (e) {
        showToast('JSON格式错误：' + e.message, 'fail');
      }
    };
    const applyAndPolishContent = async () => {
      try {
        const newResume = JSON.parse(manualJSON.value);
        if (!newResume.personal || !Array.isArray(newResume.experience)) throw new Error('结构不完整');
        Object.assign(resume, newResume);
        showManualEdit.value = false;
        isWaitingAI.value = true;
        const polished = await aiService.polishContent(resume);
        Object.assign(resume, polished);
        showToast('内容润色完成', 'success');
      } catch (e) {
        showToast('操作失败：' + e.message, 'fail');
      } finally {
        isWaitingAI.value = false;
      }
    };
    const applyAndChangeTemplate = async () => {
      try {
        const newResume = JSON.parse(manualJSON.value);
        if (!newResume.personal || !Array.isArray(newResume.experience)) throw new Error('结构不完整');
        Object.assign(resume, newResume);
        showManualEdit.value = false;
        isWaitingAI.value = true;
        const templateHtml = await aiService.generateTemplate(resume, templatePrompt.value, customColor.value, customFont.value);
        let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
        if (hasHardcodedColors(cleanHtml)) {
          showToast('⚠️ 模板包含硬编码颜色，自定义颜色可能失效。建议重新生成或手动编辑。', 'fail');
        }
        currentTemplate.value = cleanHtml;
        refreshPreview();
        showToast('新模板已应用', 'success');
      } catch (e) {
        showToast('操作失败：' + e.message, 'fail');
      } finally {
        isWaitingAI.value = false;
      }
    };

    const saveDraft = () => {
      const draft = {
        currentStep: currentStep.value,
        basicForm: { ...basicForm },
        messages: messages.value,
        resume: { ...resume },
        currentTemplate: currentTemplate.value,
        customFont: customFont.value,
        customColor: customColor.value,
        templatePrompt: templatePrompt.value
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      showToast('草稿已保存', 'success');
    };
    const loadDraft = () => {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) {
        showToast('无保存的草稿', 'fail');
        return;
      }
      try {
        const draft = JSON.parse(saved);
        currentStep.value = draft.currentStep || 1;
        Object.assign(basicForm, draft.basicForm || {});
        messages.value = draft.messages || [];
        if (draft.resume) Object.assign(resume, draft.resume);
        currentTemplate.value = draft.currentTemplate || '';
        customFont.value = draft.customFont || 'system';
        customColor.value = draft.customColor || '#2970ff';
        templatePrompt.value = draft.templatePrompt || '';
        if (currentStep.value === 3 && currentTemplate.value) refreshPreview();
        showToast('草稿加载成功', 'success');
      } catch (e) {
        showToast('草稿数据损坏', 'fail');
      }
    };

    // 导出函数：使用 html-docx-js 生成原生 DOCX
    const exportWord = () => {
      if (!resume.personal.name) {
        showToast('请先填写基本信息', 'fail');
        return;
      }
      if (!polishedHTML.value) {
        showToast('暂无预览内容', 'fail');
        return;
      }

      // 检查 htmlDocx 是否加载
      if (typeof window.htmlDocx === 'undefined') {
        showToast('DOCX 库未加载，请刷新重试', 'fail');
        return;
      }

      // 替换 CSS 变量为具体值，确保 Word 能正确显示颜色
      let processedHtml = polishedHTML.value
        .replace(/var\(--primary-color\)/g, customColor.value)
        .replace(/var\(--font-family\)/g, customFont.value === 'system' ? '-apple-system, sans-serif' : customFont.value)
        .replace(/var\(--bg-color\)/g, '#ffffff')
        .replace(/var\(--text-color\)/g, '#1e293b')
        .replace(/var\(--card-bg\)/g, '#f0f4fe')
        .replace(/var\(--border-radius\)/g, '8px')
        .replace(/var\(--box-shadow\)/g, 'none');

      // 构建完整的 HTML 文档
      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { font-family: ${customFont.value === 'system' ? '-apple-system, sans-serif' : customFont.value}; padding: 20px; background: white; }
              .resume-name { font-size: 24pt; font-weight: bold; color: ${customColor.value}; text-align: center; }
              .resume-title { font-size: 18pt; color: #666; text-align: center; }
              .resume-section { margin-top: 20px; }
              .resume-section-title { font-size: 18pt; font-weight: bold; border-bottom: 2px solid ${customColor.value}; }
              .resume-experience-item, .resume-edu-item { margin-bottom: 15px; }
              .exp-title, .edu-degree { font-weight: bold; }
              .exp-company, .edu-school { color: #666; }
              .exp-date, .edu-date { float: right; color: #999; }
              .resume-skill-item { display: inline-block; background: ${customColor.value}20; padding: 5px 10px; margin: 3px; border-radius: 4px; }
            </style>
          </head>
          <body>
            ${processedHtml}
          </body>
        </html>
      `;

      try {
        // 使用 html-docx-js 生成 DOCX 文件
        const docxBlob = window.htmlDocx.asBlob(fullHtml);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(docxBlob);
        link.download = `${resume.personal.name}_简历.docx`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('导出成功', 'success');
      } catch (e) {
        console.error('导出失败', e);
        showToast('导出失败：' + e.message, 'fail');
      }
    };

    onMounted(updateCSSVariables);

    return {
      currentStep,
      basicForm,
      messages,
      userInput,
      isWaitingAI,
      polishedHTML,
      chatBox,
      customFont,
      customColor,
      showManualEdit,
      manualJSON,
      templatePrompt,
      presetDescs,
      submitBasic,
      sendAnswer,
      goToPreview,
      exportWord,
      saveDraft,
      loadDraft,
      openManualEdit,
      cancelManualEdit,
      applyManualEditOnly,
      applyAndPolishContent,
      applyAndChangeTemplate,
      setPreset,
      randomPreset
    };
  },

  template: `
    <div class="app-container">
      <!-- 草稿操作 -->
      <div class="draft-buttons">
        <button @click="saveDraft">💾 保存草稿</button>
        <button @click="loadDraft">📂 加载草稿</button>
      </div>

      <!-- 步骤指示器（4步） -->
      <div class="step-indicator">
        <span class="step-dot" :class="{ active: currentStep >= 1 }"></span>
        <span class="step-dot" :class="{ active: currentStep >= 2 }"></span>
        <span class="step-dot" :class="{ active: currentStep >= 3 }"></span>
        <span class="step-dot" :class="{ active: currentStep >= 4 }"></span>
      </div>

      <!-- 步骤1: 基本信息 -->
      <div v-if="currentStep === 1">
        <h2>📋 基本信息</h2>
        <div class="card">
          <van-cell-group inset>
            <van-field v-model="basicForm.name" label="姓名" placeholder="例如：张小明" />
            <van-field v-model="basicForm.jobTitle" label="求职意向" placeholder="例如：前端开发" />
            <van-field v-model="basicForm.email" label="邮箱" placeholder="example@mail.com" />
            <van-field v-model="basicForm.phone" label="电话" type="tel" placeholder="手机号码" />
          </van-cell-group>
        </div>
        <button class="btn-primary" @click="submitBasic">开始AI简历收集</button>
      </div>

      <!-- 步骤2: AI询问 -->
      <div v-else-if="currentStep === 2">
        <h2>🤖 AI 助手 · 丰富信息</h2>
        <div class="card" style="padding: 0;">
          <details class="resume-preview">
            <summary>📄 当前简历概要</summary>
            <pre>{{ JSON.stringify(resume, null, 2) }}</pre>
          </details>

          <div class="chat-box" ref="chatBox">
            <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role === 'ai' ? 'ai' : 'user']">
              <div class="bubble">{{ msg.content }}</div>
            </div>
            <div v-if="isWaitingAI" class="message ai">
              <div class="bubble">⏳ AI思考中...</div>
            </div>
          </div>

          <div style="padding: 12px 16px 20px;">
            <div class="chat-input-area">
              <input type="text" v-model="userInput" placeholder="回答AI的问题..." :disabled="isWaitingAI" @keyup.enter="sendAnswer" />
              <button @click="sendAnswer" :disabled="isWaitingAI || !userInput.trim()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#2970ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div style="margin-top: 16px;">
              <button class="btn-secondary" @click="goToPreview" :disabled="isWaitingAI">下一步：预览修改</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 步骤3: 预览修改 -->
      <div v-else-if="currentStep === 3">
        <h2>🎨 预览修改</h2>
        
        <!-- 自定义字体/颜色 -->
        <div class="custom-settings">
          <div style="margin-bottom: 12px;">
            <span style="font-size:14px; color:var(--text-color);">字体风格：</span>
            <select v-model="customFont" style="width:100%; padding:10px; border-radius:40px; border:1px solid #ccd9e8; margin-top:4px;">
              <option value="system">系统默认</option>
              <option value="sans">无衬线字体</option>
              <option value="serif">衬线字体</option>
              <option value="mono">等宽字体</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size:14px; color:var(--text-color);">主色调：</span>
            <input type="color" v-model="customColor" style="width:60px; height:40px; border:none; background:transparent;" />
            <span style="font-size:12px; color:var(--text-color);">{{ customColor }}</span>
          </div>
        </div>

        <!-- 手动编辑（可折叠） -->
        <div class="manual-edit-area" v-if="showManualEdit">
          <textarea v-model="manualJSON" placeholder="编辑简历JSON..."></textarea>
          
          <!-- 模板风格自定义区域 -->
          <div class="template-prompt-section">
            <div style="font-weight:500; margin-bottom:8px;">🎨 模板风格</div>
            <div class="preset-buttons">
              <button class="btn-small" @click="setPreset(0)">经典商务</button>
              <button class="btn-small" @click="setPreset(1)">现代清新</button>
              <button class="btn-small" @click="setPreset(2)">科技感（浅色）</button>
              <button class="btn-small btn-outline" @click="randomPreset">随机</button>
            </div>
            <input type="text" v-model="templatePrompt" class="template-prompt-input" 
                   placeholder="例如：极简风格，浅灰色背景，圆角卡片，无阴影" />
            <div style="font-size:12px; color:#999; margin-bottom:8px;">
              ✨ 可自由输入任何风格描述。注意：为保证Word导出效果，背景色会被强制设为浅色，请避免深色描述。
            </div>
          </div>

          <div class="action-buttons">
            <button class="btn-small" @click="applyManualEditOnly">📝 仅保存内容</button>
            <button class="btn-small" @click="applyAndPolishContent">✨ 保存并润色内容</button>
            <button class="btn-small" @click="applyAndChangeTemplate">🎨 保存并换模板</button>
            <button class="btn-small" @click="cancelManualEdit">取消</button>
          </div>
        </div>

        <div class="card">
          <div class="preview-scroll">
            <div v-if="polishedHTML" v-html="polishedHTML"></div>
            <div v-else class="loading">
              <van-loading type="spinner" size="24px" /> 正在生成模板，请稍候...
            </div>
          </div>
          <div class="footer-buttons">
            <button class="btn-secondary" style="flex:1;" @click="openManualEdit">✏️ 手动编辑</button>
            <button class="btn-primary" style="flex:1;" @click="currentStep = 4" :disabled="!polishedHTML">下一步：定稿下载</button>
          </div>
          <button class="btn-secondary" style="margin-top: 10px;" @click="currentStep = 2">← 返回修改</button>
        </div>
      </div>

      <!-- 步骤4: 定稿下载 -->
      <div v-else-if="currentStep === 4">
        <h2>📥 定稿下载</h2>
        <div class="card">
          <div class="readonly-preview" v-html="polishedHTML"></div>
          <div class="word-export">
            <button class="btn-primary" @click="exportWord">📥 导出原生 DOCX 文件</button>
            <button class="btn-secondary" style="margin-top: 10px;" @click="currentStep = 3">← 返回预览修改</button>
          </div>
        </div>
      </div>
    </div>
  `
});

app.use(vant);
app.mount('#app');
