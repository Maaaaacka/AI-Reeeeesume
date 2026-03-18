(function() {
  const { createApp, ref, reactive, nextTick, watch, onMounted, computed, onUnmounted } = Vue;

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
    skills: []
  };

  const PRESET_COLORS = ['#6C8EB2', '#8FB3A0', '#E6B89C', '#D4A5A5', '#B39C7A', '#9B9B93'];

  const FONT_OPTIONS = [
    { value: 'system', label: '系统默认', family: '-apple-system, BlinkMacSystemFont, sans-serif' },
    { value: 'sans', label: '无衬线', family: 'Arial, Helvetica, sans-serif' },
    { value: 'serif', label: '衬线', family: 'Georgia, Times New Roman, serif' },
    { value: 'mono', label: '等宽', family: 'Courier New, monospace' }
  ];

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
        console.error('generateFirstQuestion error', e);
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
        console.error('processUserAnswer error', error);
        throw new Error('处理回答时出错');
      }
    },

    async generateTemplate(resumeData, customPrompt = '', primaryColor = '#6C8EB2', fontFamily = 'system') {
      const fontMap = {
        system: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
        sans: 'Arial, Helvetica, sans-serif',
        serif: 'Georgia, "Times New Roman", serif',
        mono: '"Courier New", monospace'
      };
      const fontDesc = fontMap[fontFamily] || fontMap.system;
      const defaultDesc = '生成一个简洁专业、适合手机浏览的简历模板，使用卡片布局，浅色背景。';
      const finalPrompt = customPrompt.trim() || defaultDesc;

      const prompt = `你是一个专业的简历HTML模板生成器。根据以下简历数据，生成一份适合手机浏览的HTML简历模板。

重要规则：
1. 所有样式必须通过CSS变量定义，绝对禁止硬编码颜色值。
2. 必须使用以下标准变量名：
   --primary-color: 主色调 (当前值: ${primaryColor})
   --font-family: 字体 (当前值: ${fontDesc})
   --bg-color: 页面背景色 (必须为浅色)
   --card-bg: 卡片背景色 (必须为浅色)
   --text-color: 正文颜色
3. 不要使用任何交互效果，简历应为纯静态样式。
4. 所有动态内容必须放在固定class的元素中：
   .resume-name, .resume-title, .resume-contact, .resume-summary
   .resume-experience-item (.exp-title, .exp-company, .exp-date, .exp-desc)
   .resume-edu-item (.edu-degree, .edu-school, .edu-date)
   .resume-skill-item
5. 直接返回完整HTML代码，不要Markdown。

风格要求：${finalPrompt}
简历数据：${JSON.stringify(resumeData)}`;

      try {
        return await utils.callAPI([{ role: 'user', content: prompt }], 0.6, false);
      } catch (e) {
        console.error('generateTemplate error', e);
        throw new Error('生成模板失败，请检查网络或API配置');
      }
    },

    async polishContent(resumeData) {
      const prompt = `你是一个简历内容润色专家。请优化以下简历的文本表达，使其更专业、简洁有力。不要改变数据结构，只修改字符串内容。以JSON格式返回完整的润色后简历。

原始简历：${JSON.stringify(resumeData)}`;
      try {
        const reply = await utils.callAPI([{ role: 'user', content: prompt }], 0.5, true);
        return JSON.parse(reply);
      } catch (e) {
        console.error('polishContent error', e);
        throw new Error('润色内容失败');
      }
    }
  };

  const app = createApp({
    components: {
      ColorWheelPicker: window.ColorWheelPicker
    },
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
      const showEditPanel = ref(false);
      const manualJSON = ref('');
      const templatePrompt = ref('');
      const fontSelectorOpen = ref(false);
      const DRAFT_KEY = 'resume_assistant_draft';

      const presetDescs = [
        '经典卡片布局（简洁稳重）',
        '圆角卡片布局（留白较多）',
        '现代感布局（强调科技感）'
      ];

      const randomPreset = () => {
        const randomIndex = Math.floor(Math.random() * presetDescs.length);
        templatePrompt.value = presetDescs[randomIndex];
      };

      const setPreset = (index) => {
        templatePrompt.value = presetDescs[index];
      };

      const showToast = (message, type = 'text') => {
        if (window.vant && window.vant.showToast) {
          window.vant.showToast({ message, type });
        } else {
          alert(`[${type}] ${message}`);
        }
      };

      const selectedFontLabel = computed(() => {
        const font = FONT_OPTIONS.find(f => f.value === customFont.value);
        return font ? font.label : '系统默认';
      });

      watch(customColor, (newColor) => {
        document.documentElement.style.setProperty('--primary', newColor);
        if (currentStep.value === 3 && currentTemplate.value) {
          refreshPreview();
        }
      });

      watch(customFont, () => {
        if (currentStep.value === 3 && currentTemplate.value) {
          refreshPreview();
        }
        fontSelectorOpen.value = false;
      });

      onMounted(() => {
        document.documentElement.style.setProperty('--primary', customColor.value);
        document.addEventListener('click', handleClickOutside);
      });

      onUnmounted(() => {
        document.removeEventListener('click', handleClickOutside);
      });

      const fillTemplateWithData = (templateHtml) => {
        if (!templateHtml) return '';
        
        let html = templateHtml;
        
        const fontFamily = FONT_OPTIONS.find(f => f.value === customFont.value)?.family || FONT_OPTIONS[0].family;
        
        html = html.replace(/var\(--primary-color\)/g, customColor.value);
        html = html.replace(/var\(--font-family\)/g, fontFamily);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // 基本信息
        const nameEl = tempDiv.querySelector('.resume-name');
        if (nameEl) nameEl.textContent = resume.personal.name || '';
        const titleEl = tempDiv.querySelector('.resume-title');
        if (titleEl) titleEl.textContent = resume.personal.jobTitle || '';
        const contactEl = tempDiv.querySelector('.resume-contact');
        if (contactEl) contactEl.textContent = `${resume.personal.email || ''} | ${resume.personal.phone || ''}`;
        const summaryEl = tempDiv.querySelector('.resume-summary');
        if (summaryEl) summaryEl.textContent = resume.summary || '';

        // 工作经历
        const expItems = tempDiv.querySelectorAll('.resume-experience-item');
        resume.experience.forEach((exp, index) => {
          if (expItems[index]) {
            const title = expItems[index].querySelector('.exp-title');
            if (title) title.textContent = exp.title || '';
            const company = expItems[index].querySelector('.exp-company');
            if (company) company.textContent = exp.company || '';
            const date = expItems[index].querySelector('.exp-date');
            if (date) date.textContent = exp.date || '';
            const desc = expItems[index].querySelector('.exp-desc');
            if (desc) desc.textContent = exp.description || '';
          }
        });

        // 教育
        const eduItems = tempDiv.querySelectorAll('.resume-edu-item');
        resume.education.forEach((edu, index) => {
          if (eduItems[index]) {
            const degree = eduItems[index].querySelector('.edu-degree');
            if (degree) degree.textContent = edu.degree || '';
            const school = eduItems[index].querySelector('.edu-school');
            if (school) school.textContent = edu.school || '';
            const date = eduItems[index].querySelector('.edu-date');
            if (date) date.textContent = edu.date || '';
          }
        });

        // 技能
        const skillItems = tempDiv.querySelectorAll('.resume-skill-item');
        resume.skills.forEach((skill, index) => {
          if (skillItems[index]) {
            skillItems[index].textContent = typeof skill === 'string' ? skill : (skill.name || '');
          }
        });
        
        return tempDiv.innerHTML;
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
        if (chatBox.value) {
          chatBox.value.scrollTop = chatBox.value.scrollHeight;
        }
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
          console.error(e);
          messages.value.push({ role: 'ai', content: '你好！我是你的简历助手。可以告诉我更多关于你的工作经历吗？' });
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
          if (result.next_question) {
            messages.value.push({ role: 'ai', content: result.next_question });
          } else {
            messages.value.push({ role: 'ai', content: '信息收集完成！点击"下一步"生成简历模板。' });
          }
        } catch (error) {
          console.error(error);
          messages.value.push({ role: 'ai', content: '抱歉，我遇到点问题。' });
        } finally {
          isWaitingAI.value = false;
        }
      };

      const goToPreview = async () => {
        console.log('直接预览被点击');
        currentStep.value = 3;
        isWaitingAI.value = true;
        try {
          console.log('正在调用生成模板API...');
          const templateHtml = await aiService.generateTemplate(resume, '', customColor.value, customFont.value);
          console.log('API返回成功');
          let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
          currentTemplate.value = cleanHtml;
          refreshPreview();
          showToast('模板生成成功', 'success');
        } catch (e) {
          console.error('模板生成失败', e);
          showToast('模板生成失败：' + e.message, 'fail');
        } finally {
          isWaitingAI.value = false;
        }
      };

      const openEditPanel = () => {
        manualJSON.value = JSON.stringify(resume, null, 2);
        showEditPanel.value = true;
      };

      const closeEditPanel = () => {
        showEditPanel.value = false;
      };

      const applyManualEditOnly = () => {
        try {
          const newResume = JSON.parse(manualJSON.value);
          if (!newResume.personal) throw new Error('结构不完整');
          Object.assign(resume, newResume);
          closeEditPanel();
          showToast('内容已更新', 'success');
        } catch (e) {
          console.error(e);
          showToast('JSON格式错误', 'fail');
        }
      };

      const applyAndPolishContent = async () => {
        try {
          const newResume = JSON.parse(manualJSON.value);
          Object.assign(resume, newResume);
          closeEditPanel();
          isWaitingAI.value = true;
          const polished = await aiService.polishContent(resume);
          Object.assign(resume, polished);
          showToast('内容润色完成', 'success');
        } catch (e) {
          console.error(e);
          showToast('操作失败', 'fail');
        } finally {
          isWaitingAI.value = false;
        }
      };

      const applyAndChangeTemplate = async () => {
        try {
          const newResume = JSON.parse(manualJSON.value);
          Object.assign(resume, newResume);
          closeEditPanel();
          isWaitingAI.value = true;
          const templateHtml = await aiService.generateTemplate(resume, templatePrompt.value, customColor.value, customFont.value);
          let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
          currentTemplate.value = cleanHtml;
          refreshPreview();
          showToast('新模板已应用', 'success');
        } catch (e) {
          console.error(e);
          showToast('操作失败', 'fail');
        } finally {
          isWaitingAI.value = false;
        }
      };

      const saveDraft = () => {
        try {
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
        } catch (e) {
          console.error('保存草稿失败', e);
          showToast('保存失败：' + e.message, 'fail');
        }
      };

      const loadDraft = () => {
        try {
          const saved = localStorage.getItem(DRAFT_KEY);
          if (!saved) {
            showToast('无保存的草稿', 'fail');
            return;
          }
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
          document.documentElement.style.setProperty('--primary', customColor.value);
          showToast('草稿加载成功', 'success');
        } catch (e) {
          console.error('加载草稿失败', e);
          showToast('草稿数据损坏或加载失败', 'fail');
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

        const buildExportHTML = () => {
          const fontFamily = customFont.value === 'system' ? '微软雅黑, Arial, sans-serif' :
                            customFont.value === 'sans' ? 'Arial, sans-serif' :
                            customFont.value === 'serif' ? 'Times New Roman, serif' :
                            'Courier New, monospace';
          const primaryColor = customColor.value;
          const name = resume.personal.name || '';
          const jobTitle = resume.personal.jobTitle || '';
          const email = resume.personal.email || '';
          const phone = resume.personal.phone || '';

          let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 2.5cm; }
    body {
      font-family: ${fontFamily};
      font-size: 12pt;
      line-height: 1.4;
      color: #1e293b;
    }
    h1 {
      font-size: 28pt;
      font-weight: bold;
      color: ${primaryColor};
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px solid ${primaryColor};
      padding-bottom: 10px;
    }
    .contact-info {
      text-align: center;
      font-size: 14pt;
      color: #4a5568;
      margin-bottom: 20px;
    }
    h2 {
      font-size: 18pt;
      font-weight: bold;
      color: ${primaryColor};
      border-bottom: 1px solid ${primaryColor};
      padding-bottom: 5px;
      margin-top: 25px;
      margin-bottom: 15px;
    }
    .experience-item, .education-item {
      margin-bottom: 20px;
    }
    .item-header {
      font-weight: bold;
      font-size: 14pt;
    }
    .item-date {
      float: right;
      color: #718096;
      font-style: italic;
    }
    .item-desc {
      margin-top: 5px;
      margin-left: 20px;
    }
    .skills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .skill-tag {
      background-color: ${primaryColor}20;
      color: ${primaryColor};
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11pt;
      border: 1px solid ${primaryColor}40;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <div class="contact-info">${escapeHtml(jobTitle)} | ${escapeHtml(email)} | ${escapeHtml(phone)}</div>`;

          if (resume.summary) {
            html += `<h2>摘要</h2><p>${escapeHtml(resume.summary)}</p>`;
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
            html += `<h2>技能</h2><div class="skills">`;
            resume.skills.forEach(skill => {
              const skillName = typeof skill === 'string' ? skill : (skill.name || '');
              html += `<span class="skill-tag">${escapeHtml(skillName)}</span>`;
            });
            html += `</div>`;
          }

          html += `</body></html>`;
          return html;
        };

        const escapeHtml = (text) => {
          if (!text) return '';
          return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        };

        try {
          const content = buildExportHTML();
          const blob = new Blob([content], { type: 'application/msword' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${resume.personal.name}_简历.doc`;
          link.click();
          URL.revokeObjectURL(link.href);
          showToast('导出成功', 'success');
        } catch (e) {
          console.error('导出失败', e);
          showToast('导出失败：' + e.message, 'fail');
        }
      };

      const progressWidth = computed(() => {
        return ((currentStep.value - 1) / 3 * 100) + '%';
      });

      const handleClickOutside = (event) => {
        if (fontSelectorOpen.value && !event.target.closest('.font-selector')) {
          fontSelectorOpen.value = false;
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
        showEditPanel,
        manualJSON,
        templatePrompt,
        presetDescs,
        PRESET_COLORS,
        FONT_OPTIONS,
        selectedFontLabel,
        fontSelectorOpen,
        progressWidth,
        submitBasic,
        sendAnswer,
        goToPreview,
        exportWord,
        saveDraft,
        loadDraft,
        openEditPanel,
        closeEditPanel,
        applyManualEditOnly,
        applyAndPolishContent,
        applyAndChangeTemplate,
        setPreset,
        randomPreset
      };
    },

    template: `
      <div class="app-container">
        <div class="overlay" :class="{ show: showEditPanel }" @click="closeEditPanel"></div>
        
        <div class="status-bar">
          <span>{{ new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
          <div class="draft-actions">
            <button @click="saveDraft">保存</button>
            <button @click="loadDraft">载入</button>
          </div>
        </div>

        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressWidth }"></div>
          </div>
          <div class="progress-labels">
            <span :class="{ active: currentStep >= 1 }">基本信息</span>
            <span :class="{ active: currentStep >= 2 }">AI收集</span>
            <span :class="{ active: currentStep >= 3 }">预览修改</span>
            <span :class="{ active: currentStep >= 4 }">定稿下载</span>
          </div>
        </div>

        <div class="content">
          <!-- 步骤1: 基本信息 -->
          <div v-if="currentStep === 1" class="section">
            <div class="card">
              <van-field v-model="basicForm.name" label="姓名" placeholder="张小明" />
              <van-field v-model="basicForm.jobTitle" label="求职意向" placeholder="前端开发" />
              <van-field v-model="basicForm.email" label="邮箱" placeholder="example@mail.com" />
              <van-field v-model="basicForm.phone" label="电话" type="tel" placeholder="手机号码" />
            </div>
            <div class="action-buttons">
              <button class="action-btn primary" @click="submitBasic">开始AI收集</button>
            </div>
          </div>

          <!-- 步骤2: AI对话 -->
          <div v-else-if="currentStep === 2" class="section">
            <div class="card">
              <details>
                <summary style="color: var(--text-light);">当前简历</summary>
                <div class="summary-block">
                  <pre>{{ JSON.stringify(resume, null, 2) }}</pre>
                </div>
              </details>
            </div>

            <div class="chat-container">
              <div class="chat-messages" ref="chatBox">
                <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role === 'ai' ? 'ai' : 'user']">
                  <div class="message-bubble">{{ msg.content }}</div>
                </div>
                <div v-if="isWaitingAI" class="message ai">
                  <div class="message-bubble">⏳ AI思考中...</div>
                </div>
              </div>

              <div class="chat-input-area">
                <input type="text" v-model="userInput" placeholder="回答AI的问题..." :disabled="isWaitingAI" @keyup.enter="sendAnswer" />
                <button @click="sendAnswer" :disabled="isWaitingAI || !userInput.trim()">↵</button>
              </div>
            </div>

            <div class="action-buttons">
              <button class="action-btn secondary" @click="goToPreview">直接预览</button>
            </div>
          </div>

          <!-- 步骤3: 预览修改 -->
          <div v-else-if="currentStep === 3" class="section">
            <div class="color-section">
              <div class="color-picker-container">
                <ColorWheelPicker v-model="customColor" />
                <div class="preset-colors" style="margin-top: 16px;">
                  <div v-for="color in PRESET_COLORS" 
                       class="color-dot" 
                       :style="{ backgroundColor: color }" 
                       :class="{ active: customColor === color }" 
                       @click="customColor = color">
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <div class="setting-item">
                <label>字体风格</label>
                <div class="font-selector">
                  <div class="font-selector-trigger" :class="{ active: fontSelectorOpen }" @click.stop="fontSelectorOpen = !fontSelectorOpen">
                    <span>{{ selectedFontLabel }}</span>
                    <span class="font-selector-arrow" :class="{ open: fontSelectorOpen }">▼</span>
                  </div>
                  <div class="font-selector-dropdown" :class="{ show: fontSelectorOpen }">
                    <div v-for="font in FONT_OPTIONS" :key="font.value"
                         class="font-option"
                         :class="{ selected: customFont === font.value }"
                         @click="customFont = font.value">
                      {{ font.label }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="preview-section">
              <div class="preview-content" v-html="polishedHTML"></div>
            </div>

            <div class="action-buttons">
              <button class="action-btn secondary" @click="openEditPanel">编辑JSON</button>
              <button class="action-btn primary" @click="currentStep = 4">下一步</button>
            </div>
            <button class="back-link" @click="currentStep = 2">← 返回</button>
          </div>

          <!-- 步骤4: 定稿下载 -->
          <div v-else-if="currentStep === 4" class="section">
            <div class="preview-section">
              <div class="preview-readonly" v-html="polishedHTML"></div>
            </div>
            <div class="action-buttons">
              <button class="action-btn primary" @click="exportWord">导出Word</button>
            </div>
            <button class="back-link" @click="currentStep = 3">← 返回修改</button>
          </div>
        </div>

        <!-- 滑动编辑面板 -->
        <div class="edit-panel" :class="{ open: showEditPanel }">
          <div class="edit-panel-header">
            <h3>编辑JSON</h3>
            <button class="edit-panel-close" @click="closeEditPanel">✕</button>
          </div>
          <div class="edit-panel-content">
            <textarea v-model="manualJSON" placeholder="编辑简历JSON..."></textarea>

            <!-- 布局预设按钮 -->
            <div style="margin: 16px 0 8px; font-size: 13px; color: var(--text-light);">布局风格（不影响颜色）</div>
            <div class="template-buttons">
              <button class="template-btn" @click="setPreset(0)">经典卡片</button>
              <button class="template-btn" @click="setPreset(1)">圆角卡片</button>
              <button class="template-btn" @click="setPreset(2)">现代感</button>
              <button class="template-btn outline" @click="randomPreset">随机</button>
            </div>
            <input type="text" v-model="templatePrompt" class="text-input" placeholder="自定义风格描述...">

            <div class="edit-actions">
              <button class="edit-btn" @click="applyManualEditOnly">仅保存</button>
              <button class="edit-btn" @click="applyAndPolishContent">润色内容</button>
              <button class="edit-btn primary" @click="applyAndChangeTemplate">换模板</button>
            </div>
          </div>
        </div>
      </div>
    `
  });

  app.use(vant);
  app.mount('#app');
})();
