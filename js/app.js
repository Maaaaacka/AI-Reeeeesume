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
    skills: [],
    jdContext: null
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
      let extraContext = '';
      if (resumeData.jdContext && resumeData.jdContext.keywords && resumeData.jdContext.requirements) {
        extraContext = `\n\n职位JD要求参考：关键词：${resumeData.jdContext.keywords.join('、')}；能力要求：${resumeData.jdContext.requirements.join('、')}。请在引导用户补充信息时，重点关注这些能力。`;
      }
      const systemPrompt = `你是一个简历助手。当前简历（JSON格式）如下：
${JSON.stringify(resumeData, null, 2)}${extraContext}

请根据对话历史，尤其是用户的最后一次回答，更新简历内容。然后提出下一个问题以收集更多信息（如果简历已完整则next_question设为null）。

在提问时，遵循以下原则：
- 如果用户的回答缺乏具体细节（如未提及量化成果、具体案例、数据支撑），应追问补充，例如“能具体说一下这个项目中你的贡献吗？比如提升了多少效率？”或“这个经历中有什么可量化的成果吗？”
- 如果已经与JD要求相关的能力，但用户未体现，可提醒用户补充相关经历。

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
          const result = JSON.parse(aiReply);
          if (result.resume) {
            if (!result.resume.jdContext) result.resume.jdContext = resumeData.jdContext;
            Object.assign(resumeData, result.resume);
          }
          return result;
        } catch (e) {
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
        throw new Error('生成模板失败');
      }
    },

    async polishContent(resumeData) {
      const prompt = `你是一个简历内容润色专家。请优化以下简历的文本表达，使其更专业、简洁有力。不要改变数据结构，只修改字符串内容。以JSON格式返回完整的润色后简历。

原始简历：${JSON.stringify(resumeData)}`;
      try {
        const reply = await utils.callAPI([{ role: 'user', content: prompt }], 0.5, true);
        return JSON.parse(reply);
      } catch (e) {
        throw new Error('润色内容失败');
      }
    },

    async analyzeJD(jdText) {
      const prompt = `请分析以下职位描述，提取核心关键词（技术栈、工具）和能力要求（软技能、硬技能）。以JSON格式返回，格式如下：
{
  "keywords": ["关键词1", "关键词2", ...],
  "requirements": ["要求1", "要求2", ...]
}
职位描述：
${jdText}`;
      try {
        const reply = await utils.callAPI([{ role: 'user', content: prompt }], 0.3, true);
        return JSON.parse(reply);
      } catch (e) {
        throw new Error('分析失败');
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
      const jdText = ref('');
      const jdAnalysisResult = ref(null);
      const isAnalyzingJD = ref(false);
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

      const progressBar = new window.ProgressBar({
        container: null,
        autoClose: true,
        closeDelay: 500
      });

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
        if (window.vant?.showToast) {
          window.vant.showToast({ message, type });
        } else {
          alert(message);
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
        
        const nameEl = tempDiv.querySelector('.resume-name');
        if (nameEl) nameEl.textContent = resume.personal.name || '';
        
        const titleEl = tempDiv.querySelector('.resume-title');
        if (titleEl) titleEl.textContent = resume.personal.jobTitle || '';
        
        const contactEl = tempDiv.querySelector('.resume-contact');
        if (contactEl) contactEl.textContent = `${resume.personal.email || ''} | ${resume.personal.phone || ''}`;
        
        const summaryEl = tempDiv.querySelector('.resume-summary');
        if (summaryEl) summaryEl.textContent = resume.summary || '';
        
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
        if (jdText.value.trim()) {
          resume.jdText = jdText.value;
        }
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
          messages.value.push({ role: 'ai', content: '抱歉，我遇到点问题。' });
        } finally {
          isWaitingAI.value = false;
        }
      };

      const goToPreview = async () => {
        currentStep.value = 3;
        
        await nextTick();
        const previewSection = document.querySelector('.preview-section');
        if (previewSection) {
          progressBar.show(previewSection);
          progressBar.start('正在生成模板...');
        }
        
        try {
          const templateHtml = await aiService.generateTemplate(resume, templatePrompt.value, customColor.value, customFont.value);
          let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
          currentTemplate.value = cleanHtml;
          refreshPreview();
          progressBar.finish('生成成功！');
          showToast('模板生成成功', 'success');
        } catch (e) {
          progressBar.fail('生成失败');
          showToast('模板生成失败', 'fail');
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
          showToast('JSON格式错误', 'fail');
        }
      };

      const applyAndPolishContent = async () => {
        try {
          const newResume = JSON.parse(manualJSON.value);
          Object.assign(resume, newResume);
          closeEditPanel();
          
          const editPanelContent = document.querySelector('.edit-panel-content');
          if (editPanelContent) {
            progressBar.show(editPanelContent);
            progressBar.start('正在润色内容...');
          }
          
          const polished = await aiService.polishContent(resume);
          Object.assign(resume, polished);
          progressBar.finish('润色完成！');
          showToast('内容润色完成', 'success');
        } catch (e) {
          progressBar.fail('润色失败');
          showToast('操作失败', 'fail');
        }
      };

      const applyAndChangeTemplate = async () => {
        try {
          const newResume = JSON.parse(manualJSON.value);
          Object.assign(resume, newResume);
          closeEditPanel();
          
          const editPanelContent = document.querySelector('.edit-panel-content');
          if (editPanelContent) {
            progressBar.show(editPanelContent);
            progressBar.start('正在生成新模板...');
          }
          
          const templateHtml = await aiService.generateTemplate(resume, templatePrompt.value, customColor.value, customFont.value);
          let cleanHtml = templateHtml.replace(/^\s*```html\s*/i, '').replace(/\s*```\s*$/, '');
          currentTemplate.value = cleanHtml;
          refreshPreview();
          progressBar.finish('模板已更新！');
          showToast('新模板已应用', 'success');
        } catch (e) {
          progressBar.fail('生成失败');
          showToast('操作失败', 'fail');
        }
      };

      const saveDraft = () => {
        const draft = {
          currentStep: currentStep.value,
          basicForm: { ...basicForm },
          jdText: jdText.value,
          jdAnalysisResult: jdAnalysisResult.value,
          messages: messages.value,
          resume: { ...resume },
          currentTemplate: currentTemplate.value,
          customFont: customFont.value,
          customColor: customColor.value,
          templatePrompt: templatePrompt.value,
          jdContext: resume.jdContext
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
          jdText.value = draft.jdText || '';
          jdAnalysisResult.value = draft.jdAnalysisResult || null;
          messages.value = draft.messages || [];
          if (draft.resume) Object.assign(resume, draft.resume);
          currentTemplate.value = draft.currentTemplate || '';
          customFont.value = draft.customFont || 'system';
          customColor.value = draft.customColor || '#6C8EB2';
          templatePrompt.value = draft.templatePrompt || '';
          if (draft.jdContext) resume.jdContext = draft.jdContext;
          if (currentStep.value === 3 && currentTemplate.value) refreshPreview();
          document.documentElement.style.setProperty('--primary', customColor.value);
          showToast('草稿加载成功', 'success');
        } catch (e) {
          showToast('草稿数据损坏', 'fail');
        }
      };

      const exportWord = () => {
        if (!polishedHTML.value) {
          showToast('暂无预览内容', 'fail');
          return;
        }
        if (typeof window.htmlDocx === 'undefined') {
          showToast('DOCX库未加载', 'fail');
          return;
        }

        try {
          const docxBlob = window.htmlDocx.asBlob(polishedHTML.value);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(docxBlob);
          link.download = `${resume.personal.name || 'resume'}_简历.docx`;
          link.click();
          URL.revokeObjectURL(link.href);
          showToast('导出成功', 'success');
        } catch (e) {
          showToast('导出失败', 'fail');
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

      const analyzeJD = async () => {
        if (!jdText.value.trim()) {
          showToast('请粘贴职位描述', 'fail');
          return;
        }
        
        const cardElement = document.querySelector('.card');
        if (cardElement) {
          progressBar.show(cardElement);
          progressBar.start('正在分析职位描述...');
        }
        
        isAnalyzingJD.value = true;
        try {
          const result = await aiService.analyzeJD(jdText.value);
          jdAnalysisResult.value = result;
          resume.jdContext = result;
          progressBar.finish('分析完成！');
          showToast('分析完成', 'success');
        } catch (error) {
          progressBar.fail('分析失败');
          showToast('分析失败', 'fail');
        } finally {
          isAnalyzingJD.value = false;
        }
      };

      return {
        currentStep,
        basicForm,
        jdText,
        jdAnalysisResult,
        isAnalyzingJD,
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
        resume,
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
        randomPreset,
        analyzeJD
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
          <div v-if="currentStep === 1" class="section">
            <div class="card">
              <van-field v-model="basicForm.name" label="姓名" placeholder="张小明" />
              <van-field v-model="basicForm.jobTitle" label="求职意向" placeholder="前端开发" />
              <van-field v-model="basicForm.email" label="邮箱" placeholder="example@mail.com" />
              <van-field v-model="basicForm.phone" label="电话" type="tel" placeholder="手机号码" />
            </div>
            <div class="card">
              <div style="font-size: 14px; color: var(--text-light); margin-bottom: 8px;">职位描述（可选）</div>
              <textarea v-model="jdText" rows="4" class="jd-textarea" placeholder="粘贴职位描述，AI将分析核心关键词和能力要求..."></textarea>
              <button class="template-btn outline" style="margin-top: 12px; width: 100%;" @click="analyzeJD" :disabled="isAnalyzingJD">{{ isAnalyzingJD ? '分析中' : '分析JD' }}</button>
              <div v-if="jdAnalysisResult" class="jd-result" style="margin-top: 12px;">
                <h4>核心关键词</h4>
                <div class="keyword-tags">
                  <span v-for="kw in jdAnalysisResult.keywords" :key="kw" class="keyword-tag">{{ kw }}</span>
                </div>
                <h4>能力要求</h4>
                <ul style="margin-left: 20px; margin-bottom: 8px;">
                  <li v-for="req in jdAnalysisResult.requirements" :key="req">{{ req }}</li>
                </ul>
              </div>
            </div>
            <div class="action-buttons">
              <button class="action-btn primary" @click="submitBasic">开始AI收集</button>
            </div>
          </div>

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
                  <div class="message-bubble">AI思考中...</div>
                </div>
              </div>

              <div class="chat-input-area">
                <input type="text" v-model="userInput" placeholder="回答AI的问题..." :disabled="isWaitingAI" @keyup.enter="sendAnswer" />
                <button @click="sendAnswer" :disabled="isWaitingAI || !userInput.trim()">↵</button>
              </div>
            </div>

            <div class="action-buttons">
              <button class="action-btn secondary" @click="goToPreview" :disabled="isWaitingAI">直接预览</button>
            </div>
          </div>

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

          <div v-else-if="currentStep === 4" class="section">
            <div class="preview-section">
              <div class="preview-readonly" v-html="polishedHTML"></div>
            </div>
            <div class="action-buttons">
              <button class="action-btn primary" @click="exportWord">导出DOCX</button>
            </div>
            <button class="back-link" @click="currentStep = 3">← 返回修改</button>
          </div>
        </div>

        <div class="edit-panel" :class="{ open: showEditPanel }">
          <div class="edit-panel-header">
            <h3>编辑JSON</h3>
            <button class="edit-panel-close" @click="closeEditPanel">✕</button>
          </div>
          <div class="edit-panel-content">
            <textarea v-model="manualJSON" placeholder="编辑简历JSON..."></textarea>
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
