(function() {
  const { createApp, ref, reactive, nextTick, watch, onMounted, computed, onUnmounted } = Vue;

  let API_CONFIG = null;
  let XUNFEI_CONFIG = null;
  let isAppMounted = false;

  function showLoading(show) {
    const appDiv = document.getElementById('app');
    if (appDiv) {
      if (show) {
        appDiv.innerHTML = `
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">正在加载配置...</div>
          </div>
        `;
      }
    }
  }

  // --- 关键修复：修正加载路径 ---
  async function loadConfig() {
    showLoading(true);
    try {
      // 路径修改为根目录，并加上时间戳防止浏览器缓存旧文件
      const response = await fetch('api-config.json?v=' + Date.now());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const config = await response.json();
      API_CONFIG = config.deepseek;
      XUNFEI_CONFIG = config.xunfei;
      return true;
    } catch (error) {
      console.error('加载配置文件失败:', error);
      const appDiv = document.getElementById('app');
      if (appDiv) {
        appDiv.innerHTML = `
          <div class="loading-container">
            <div class="loading-text" style="color: #f56c6c;">配置加载失败</div>
            <div class="loading-text" style="font-size: 12px;">无法读取 api-config.json</div>
            <div class="loading-text" style="font-size: 10px; color: #999;">错误详情: ${error.message}</div>
          </div>
        `;
      }
      return false;
    }
  }

  function initApp() {
    if (isAppMounted) return;
    
    const App = {
      setup() {
        const userInput = ref('');
        const messages = reactive([]);
        const isGenerating = ref(false);
        const chatBox = ref(null);
        const isRecording = ref(false);
        const showEditPanel = ref(false);
        const manualJSON = ref('');
        const templatePrompt = ref('');
        const currentTemplate = ref(0); 
        const primaryColor = ref('#6C8EB2');
        
        let asr = null;
        let tts = null;
        let progressBar = null;

        const scrollToBottom = async () => {
          await nextTick();
          if (chatBox.value) {
            chatBox.value.scrollTop = chatBox.value.scrollHeight;
          }
        };

        watch(messages, scrollToBottom, { deep: true });

        onMounted(() => {
          isAppMounted = true;
          // 初始化进度条逻辑（对应你的 progress-bar.js）
          if (typeof ProgressBar !== 'undefined') {
            progressBar = new ProgressBar({
              container: document.querySelector('.app-container')
            });
          }
        });

        // 发送逻辑 (保持你原有的简历助手逻辑)
        const handleSendMessage = async () => {
          if (!userInput.value.trim() || isGenerating.value) return;

          const content = userInput.value;
          messages.push({ role: 'user', content });
          userInput.value = '';
          isGenerating.value = true;

          if (progressBar) progressBar.show();

          try {
            const response = await fetch(API_CONFIG.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.key}`
              },
              body: JSON.stringify({
                model: API_CONFIG.model,
                messages: [
                  { role: "system", content: "你是一个专业的简历专家。请始终以 JSON 格式返回数据。包含：name, title, contact, summary, experience, education, skills。" },
                  ...messages.map(m => ({ role: m.role, content: m.content }))
                ]
              })
            });

            const data = await response.json();
            const aiContent = data.choices[0].message.content;

            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              manualJSON.value = jsonMatch[0];
              messages.push({ role: 'assistant', content: "简历已更新，点击编辑查看。", isJson: true });
            } else {
              messages.push({ role: 'assistant', content: aiContent });
            }

            // 语音播报
            if (!tts) tts = new XunfeiTTS(XUNFEI_CONFIG);
            tts.speak(aiContent.replace(/\{[\s\S]*\}/g, ''));

          } catch (error) {
            vant.showToast('生成失败');
          } finally {
            isGenerating.value = false;
            if (progressBar) progressBar.hide();
          }
        };

        // --- 语音切换 (对接修复后的 XunfeiASR) ---
        const toggleVoice = async () => {
          if (isRecording.value) {
            if (asr) asr.stop();
            isRecording.value = false;
          } else {
            if (!asr) {
              asr = new XunfeiASR(XUNFEI_CONFIG);
              asr.onResult = (text, isLast) => {
                if (text) {
                  userInput.value = text;
                  if (isLast) {
                    isRecording.value = false;
                    handleSendMessage();
                  }
                }
              };
              asr.onError = (err) => {
                vant.showToast('识别失败: ' + err);
                isRecording.value = false;
              };
            }
            try {
              await asr.start();
              isRecording.value = true;
            } catch (err) {
              vant.showToast('无法启动录音');
            }
          }
        };

        // 简历预览计算属性
        const parsedResume = computed(() => {
          try { return JSON.parse(manualJSON.value); } catch (e) { return null; }
        });

        return {
          userInput, messages, isGenerating, isRecording, chatBox,
          showEditPanel, manualJSON, templatePrompt, currentTemplate, primaryColor,
          handleSendMessage, toggleVoice, parsedResume,
          openEditPanel: () => { showEditPanel.value = true; },
          closeEditPanel: () => { showEditPanel.value = false; },
          setPreset: (idx) => { currentTemplate.value = idx; },
          applyManualEditOnly: () => { vant.showToast('保存成功'); showEditPanel.value = false; }
        };
      },
      template: `
        <div class="app-container" :style="{'--primary': primaryColor}">
          <div class="chat-header">
            <h2>简历助手</h2>
            <color-wheel-picker v-model:color="primaryColor"></color-wheel-picker>
          </div>

          <div class="chat-messages" ref="chatBox">
            <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
              <div class="message-content">
                {{ msg.content }}
                <div v-if="msg.isJson && parsedResume" class="resume-preview-mini" :class="'tpl-' + currentTemplate">
                  <h4>{{ parsedResume.name }}</h4>
                  <p>{{ parsedResume.title }}</p>
                </div>
              </div>
            </div>
            <div v-if="isGenerating" class="message assistant">
              <div class="message-content">思考中...</div>
            </div>
          </div>

          <div class="input-area">
            <div class="input-wrapper">
              <input v-model="userInput" placeholder="说点什么..." @keyup.enter="handleSendMessage">
              <button :class="['voice-btn', {active: isRecording}]" @click="toggleVoice">
                <div class="mic-icon"></div>
              </button>
              <button class="send-btn" @click="handleSendMessage">发送</button>
            </div>
          </div>

          <button class="fab-btn" v-if="manualJSON" @click="openEditPanel">编辑</button>

          <div v-if="showEditPanel" class="edit-panel-overlay" @click.self="closeEditPanel">
            <div class="edit-panel">
              <textarea v-model="manualJSON"></textarea>
              <div class="tpl-btns">
                <button @click="setPreset(0)">经典</button>
                <button @click="setPreset(1)">圆角</button>
                <button @click="setPreset(2)">现代</button>
              </div>
              <button class="apply-btn" @click="applyManualEditOnly">确定</button>
            </div>
          </div>
        </div>
      `
    };

    const vueApp = createApp(App);
    vueApp.use(vant);
    vueApp.mount('#app');
  }

  // 启动
  loadConfig().then(success => {
    if (success) initApp();
  });
})();
