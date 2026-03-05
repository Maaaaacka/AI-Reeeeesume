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

const PRESET_COLORS = ['#6C8EB2', '#8FB3A0', '#E6B89C', '#D4A5A5', '#B39C7A', '#9B9B93'];

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

const hasHardcodedColors = (html) => {
  const colorRegex = /#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/gi;
  return colorRegex.test(html);
};

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

  async generateTemplate(resumeData, customPrompt = '', primaryColor = '#6C8EB2', fontFamily = 'system') {
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

const { createApp, ref, reactive, nextTick, watch, onMounted } = Vue;

const app = createApp({
  setup() {
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
    const customColor = ref('#6C8EB2');
    const showManualEdit = ref(false);
    const manualJSON = ref('');
    const templatePrompt = ref('');
    const DRAFT_KEY = 'resume_assistant_draft';

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

    const showToast = (message, type = 'text') => {
      if (window.vant?.showToast) {
        window.vant.showToast({ message, type });
      } else {
        alert(`[${type}] ${message}`);
      }
    };

    const updateCSSVariables = () => {
      document.documentElement.style.setProperty('--primary', customColor.value);
    };
    watch(customColor, updateCSSVariables);

    onMounted(() => {
      updateCSSVariables();
      if (window.iro) {
        setTimeout(() => {
          const colorPicker = new iro.ColorPicker('#color-picker', {
            width: 260,
            color: customColor.value,
            borderWidth: 0,
            layout: [
              { component: iro.ui.Wheel, options: { wheelLightness: false } },
              { component: iro.ui.Slider, options: { sliderType: 'value' } }
            ]
          });
          colorPicker.on('color:change', (color) => {
            customColor.value = color.hexString;
          });
          window.colorPicker = colorPicker;
        }, 100);
      }
    });

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
        showToast('请填写姓名和求职意向', 'fail');
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
        customColor.value = draft.customColor || '#6C8EB2';
        templatePrompt.value = draft.templatePrompt || '';
        if (currentStep.value === 3 && currentTemplate.value) refreshPreview();
        showToast('草稿加载成功', 'success');
      } catch (e) {
        showToast('草稿数据损坏', 'fail');
      }
    };

    const exportWord = () => {
      if (!resume.personal.name) {
        showToast('请先填写基本信息', 'fail');
        return;
      }
      if (!polishedHTML.value) {
        showToast('暂无预览内容', 'fail');
        return;
      }
      if (typeof window.htmlDocx === 'undefined') {
        showToast('DOCX 库未加载，请刷新重试', 'fail');
        return;
      }

      const buildWordHTML = () => {
        const fontFamily = customFont.value === 'system' ? '微软雅黑, Arial, sans-serif' : customFont.value === 'sans' ? 'Arial, sans-serif' : customFont.value === 'serif' ? 'Times New Roman, serif' : 'Courier New, monospace';
        const primaryColor = customColor.value;
        const name = resume.personal.name || '';
        const jobTitle = resume.personal.jobTitle || '';
        const email = resume.personal.email || '';
        const phone = resume.personal.phone || '';

        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:2.5cm;}body{font-family:${fontFamily};font-size:12pt;line-height:1.4;color:#1e293b;}h1{font-size:28pt;font-weight:bold;color:${primaryColor};text-align:center;margin-bottom:10px;border-bottom:2px solid ${primaryColor};padding-bottom:10px;}.contact-info{text-align:center;font-size:14pt;color:#4a5568;margin-bottom:20px;}h2{font-size:18pt;font-weight:bold;color:${primaryColor};border-bottom:1px solid ${primaryColor};padding-bottom:5px;margin-top:25px;margin-bottom:15px;}.experience-item,.education-item{margin-bottom:20px;}.item-header{font-weight:bold;font-size:14pt;}.item-date{float:right;color:#718096;font-style:italic;}.item-desc{margin-top:5px;margin-left:20px;}.skills{display:flex;flex-wrap:wrap;gap:10px;}.skill-tag{background-color:${primaryColor}20;color:${primaryColor};padding:5px 12px;border-radius:20px;font-size:11pt;border:1px solid ${primaryColor}40;}</style></head><body>`;

        const escapeHtml = (text) => {
          if (!text) return '';
          return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        };

        html += `<h1>${escapeHtml(name)}</h1>`;
        html += `<div class="contact-info">${escapeHtml(jobTitle)} | ${escapeHtml(email)} | ${escapeHtml(phone)}</div>`;

        if (resume.summary) {
          html += `<h2>摘要</h2>`;
          html += `<p>${escapeHtml(resume.summary)}</p>`;
        }

        if (resume.experience && resume.experience.length > 0) {
          html += `<h2>工作经历</h2>`;
          resume.experience.forEach(exp => {
            html += `<div class="experience-item">`;
            html += `<div class="item-header">${escapeHtml(exp.title || '')} @ ${escapeHtml(exp.company || '')} <span class="item-date">${escapeHtml(exp.date || '')}</span></div>`;
            if (exp.description) {
              let descText = '';
              if (Array.isArray(exp.description)) {
                descText = exp.description.map(item => escapeHtml(item)).join('<br/>');
              } else if (typeof exp.description === 'object') {
                descText = escapeHtml(JSON.stringify(exp.description, null, 2));
              } else {
                descText = escapeHtml(String(exp.description));
              }
              html += `<div class="item-desc">${descText.replace(/\n/g, '<br/>')}</div>`;
            }
            html += `</div>`;
          });
        }

        if (resume.education && resume.education.length > 0) {
          html += `<h2>教育背景</h2>`;
          resume.education.forEach(edu => {
            html += `<div class="education-item">`;
            html += `<div class="item-header">${escapeHtml(edu.degree || '')} @ ${escapeHtml(edu.school || '')} <span class="item-date">${escapeHtml(edu.date || '')}</span></div>`;
            html += `</div>`;
          });
        }

        if (resume.skills && resume.skills.length > 0) {
          html += `<h2>技能</h2>`;
          html += `<div class="skills">`;
          resume.skills.forEach(skill => {
            const skillName = typeof skill === 'string' ? skill : (skill.name || '');
            html += `<span class="skill-tag">${escapeHtml(skillName)}</span>`;
          });
          html += `</div>`;
        }

        html += `</body></html>`;
        return html;
      };

      try {
        const docxBlob = window.htmlDocx.asBlob(buildWordHTML());
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
      PRESET_COLORS,
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
      <div class="status-bar">
        <span>{{ new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
        <div class="draft-buttons">
          <button @click="saveDraft">保存</button>
          <button @click="loadDraft">载入</button>
        </div>
      </div>

      <div class="steps">
        <div class="step-indicator">
          <div class="step-item"><div class="step-fill" :class="'active-' + currentStep"></div></div>
          <div class="step-item"><div class="step-fill" :class="'active-' + currentStep"></div></div>
          <div class="step-item"><div class="step-fill" :class="'active-' + currentStep"></div></div>
          <div class="step-item"><div class="step-fill" :class="'active-' + currentStep"></div></div>
        </div>
        <div class="step-labels">
          <span :class="{ active: currentStep >= 1 }">基本信息</span>
          <span :class="{ active: currentStep >= 2 }">AI收集</span>
          <span :class="{ active: currentStep >= 3 }">预览修改</span>
          <span :class="{ active: currentStep >= 4 }">定稿下载</span>
        </div>
      </div>

      <div class="content">
        <div v-if="currentStep === 1">
          <div class="card">
            <div class="field-group">
              <van-field v-model="basicForm.name" label="姓名" placeholder="张小明" />
              <van-field v-model="basicForm.jobTitle" label="求职意向" placeholder="前端开发" />
              <van-field v-model="basicForm.email" label="邮箱" placeholder="example@mail.com" />
              <van-field v-model="basicForm.phone" label="电话" type="tel" placeholder="手机号码" />
            </div>
          </div>
          <button class="btn-primary bottom-actions" @click="submitBasic">开始AI简历收集</button>
        </div>

        <div v-else-if="currentStep === 2">
          <div class="card">
            <details>
              <summary style="color: var(--text-secondary); margin-bottom: 12px;">📄 当前简历</summary>
              <pre style="font-size: 12px; background: var(--surface-secondary); padding: 12px; border-radius: 12px;">{{ JSON.stringify(resume, null, 2) }}</pre>
            </details>
          </div>

          <div class="chat-area">
            <div class="messages" ref="chatBox">
              <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role === 'ai' ? 'ai' : 'user']">
                <div class="bubble">{{ msg.content }}</div>
              </div>
              <div v-if="isWaitingAI" class="message ai">
                <div class="bubble">⏳ AI思考中...</div>
              </div>
            </div>

            <div class="chat-input-container">
              <input type="text" v-model="userInput" placeholder="回答AI的问题..." :disabled="isWaitingAI" @keyup.enter="sendAnswer" />
              <button @click="sendAnswer" :disabled="isWaitingAI || !userInput.trim()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="bottom-actions">
            <button class="btn-secondary" @click="goToPreview" :disabled="isWaitingAI">直接预览</button>
          </div>
        </div>

        <div v-else-if="currentStep === 3">
          <div class="color-section">
            <div class="color-picker-container">
              <div id="color-picker"></div>
              <div class="preset-colors">
                <div v-for="color in PRESET_COLORS" :key="color" class="preset-dot" :style="{ backgroundColor: color }" :class="{ active: customColor === color }" @click="customColor = color; if(window.colorPicker) window.colorPicker.color.hexString = color"></div>
              </div>
            </div>
          </div>

          <div class="template-section">
            <div style="margin-bottom: 12px;">
              <label style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">字体风格</label>
              <select v-model="customFont" style="width:100%; padding:12px; border-radius:30px; border:1px solid var(--border); margin-top:6px; background: white;">
                <option value="system">系统默认</option>
                <option value="sans">无衬线字体</option>
                <option value="serif">衬线字体</option>
                <option value="mono">等宽字体</option>
              </select>
            </div>

            <div class="preset-buttons">
              <button class="preset-btn" @click="setPreset(0)">经典商务</button>
              <button class="preset-btn" @click="setPreset(1)">现代清新</button>
              <button class="preset-btn" @click="setPreset(2)">科技感</button>
              <button class="preset-btn outline" @click="randomPreset">随机</button>
            </div>

            <input type="text" v-model="templatePrompt" class="template-prompt-input" placeholder="自定义风格描述..." style="width:100%; padding:12px; border-radius:30px; border:1px solid var(--border); margin-top:8px;">
          </div>

          <div v-if="showManualEdit" class="manual-edit">
            <textarea v-model="manualJSON" placeholder="编辑简历JSON..."></textarea>
            <div class="action-buttons">
              <button class="action-btn" @click="applyManualEditOnly">仅保存</button>
              <button class="action-btn" @click="applyAndPolishContent">润色内容</button>
              <button class="action-btn primary" @click="applyAndChangeTemplate">换模板</button>
              <button class="action-btn" @click="cancelManualEdit">取消</button>
            </div>
          </div>

          <div class="preview-area">
            <div class="preview-content">
              <div v-if="polishedHTML" v-html="polishedHTML"></div>
              <div v-else class="loading">生成模板中...</div>
            </div>
          </div>

          <div class="bottom-actions">
            <button class="btn-secondary" @click="openManualEdit">手动编辑</button>
            <button class="btn-primary" @click="currentStep = 4" :disabled="!polishedHTML">下一步</button>
          </div>
          <button class="btn-secondary" style="margin-top: 8px;" @click="currentStep = 2">← 返回</button>
        </div>

        <div v-else-if="currentStep === 4">
          <div class="preview-area">
            <div class="readonly-preview" v-html="polishedHTML"></div>
          </div>
          <div class="bottom-actions">
            <button class="btn-primary" @click="exportWord">导出 DOCX</button>
          </div>
          <button class="btn-secondary" style="margin-top: 8px;" @click="currentStep = 3">← 返回修改</button>
        </div>
      </div>
    </div>
  `
});

app.use(vant);
app.mount('#app');
