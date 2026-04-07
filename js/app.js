(function() {
  const { createApp, ref, reactive, nextTick, watch, onMounted, computed, onUnmounted } = Vue;

  let API_CONFIG = null;
  let XUNFEI_CONFIG = null;
  let app = null;
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

  async function loadConfig() {
    showLoading(true);
    try {
      // 修正路径：根据你的目录结构，直接读取根目录的 json
      const response = await fetch('api-config.json');
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
            <div class="loading-text" style="font-size: 12px;">请检查 api-config.json 文件是否存在</div>
          </div>
        `;
      }
      return false;
    }
  }

  function initApp() {
    if (isAppMounted) return;
    
    app = createApp({
      setup() {
        const userInput = ref('');
        const messages = reactive([]);
        const isGenerating = ref(false);
        const chatBox = ref(null);
        const isRecording = ref(false);
        const showEditPanel = ref(false);
        const manualJSON = ref('');
        const templatePrompt = ref('');
        const currentTemplate = ref(0); // 0: 卡片, 1: 圆角, 2: 现代
        const primaryColor = ref('#6C8EB2');
        
        let asr = null;
        let tts = null;
        let progressBar = null;

        // 自动滚动
        const scrollToBottom = async () => {
          await nextTick();
          if (chatBox.value) {
            chatBox.value.scrollTop = chatBox.value.scrollHeight;
          }
        };

        watch(messages, scrollToBottom, { deep: true });

        onMounted(() => {
          isAppMounted = true;
          // 初始化进度条
          progressBar = new ProgressBar({
            container: document.querySelector('.app-container')
          });
        });

        // 发送消息核心逻辑
        const handleSendMessage = async () => {
          if (!userInput.value.trim() || isGenerating.value) return;

          const content = userInput.value;
          messages.push({ role: 'user', content });
          userInput.value = '';
          isGenerating.value = true;

          // 显示进度条
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
                  { role: "system", content: "你是一个专业的简历专家。请根据用户需求生成或润色简历，并始终以 JSON 格式返回数据。JSON 包含：name, title, contact, summary, experience (array), education (array), skills (array)。" },
                  ...messages.map(m => ({ role: m.role, content: m.content }))
                ],
                temperature: 0.7
              })
            });

            if (!response.ok) throw new Error('网络请求失败');
            const data = await response.json();
            const aiContent = data.choices[0].message.content;

            // 尝试提取 JSON
            const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              manualJSON.value = jsonMatch[0];
              messages.push({ 
                role: 'assistant', 
                content: "简历已为您更新，您可以点击右下角编辑按钮查看详情。",
                isJson: true 
              });
            } else {
              messages.push({ role: 'assistant', content: aiContent });
            }

            // AI 回复后自动 TTS 播报
            if (!tts) tts = new XunfeiTTS(XUNFEI_CONFIG);
            tts.speak(aiContent.replace(/\{[\s\S]*\}/g, ''));

          } catch (error) {
            vant.showToast('生成失败: ' + error.message);
          } finally {
            isGenerating.value = false;
            if (progressBar) progressBar.hide();
          }
        };

        // 语音切换逻辑
        const toggleVoice = async () => {
          if (isRecording.value) {
            if (asr) asr.stop();
            isRecording.value = false;
          } else {
            if (!asr) {
              asr = new XunfeiASR(XUNFEI_CONFIG);
              
              // 关键：语音识别结果的回调逻辑
              asr.onResult = (text, isLast) => {
                if (text) {
                  userInput.value = text; // 将识别出的文字填入输入框
                  if (isLast) {
                    console.log("语音识别结束，发送消息...");
                    isRecording.value = false;
                    handleSendMessage(); // 自动发送
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
              vant.showToast('请说话...');
            } catch (err) {
              vant.showToast('无法启动录音');
            }
          }
        };

        // 简历编辑相关方法
        const openEditPanel = () => { showEditPanel.value = true; };
        const closeEditPanel = () => { showEditPanel.value = false; };
        
        const setPreset = (index) => { currentTemplate.value = index; };
        const randomPreset = () => { currentTemplate.value = Math.floor(Math.random() * 3); };

        const applyManualEditOnly = () => { 
            vant.showToast('已保存'); 
            closeEditPanel(); 
        };

        const parsedResume = computed(() => {
          try {
            return JSON.parse(manualJSON.value);
          } catch (e) {
            return null;
          }
        });

        return {
          userInput, messages, isGenerating, isRecording, chatBox,
          showEditPanel, manualJSON, templatePrompt, currentTemplate, primaryColor,
          handleSendMessage, toggleVoice, openEditPanel, closeEditPanel,
          setPreset, randomPreset, applyManualEditOnly, parsedResume
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
              <div class="message-content loading-dots">正在思考</div>
            </div>
          </div>

          <div class="input-area">
            <div class="input-wrapper">
              <input v-model="userInput" placeholder="描述你的经历..." @keyup.enter="handleSendMessage">
              <button :class="['voice-btn', {active: isRecording}]" @click="toggleVoice">
                <div class="mic-icon"></div>
              </button>
              <button class="send-btn" @click="handleSendMessage" :disabled="isGenerating">发送</button>
            </div>
          </div>

          <button class="fab-btn" @click="openEditPanel" v-if="manualJSON">
            <span>编辑</span>
          </button>

          <div v-if="showEditPanel" class="edit-panel-overlay" @click.self="closeEditPanel">
            <div class="edit-panel">
              <div class="edit-header">
                <h3>简历数据管理</h3>
                <button @click="closeEditPanel">✕</button>
              </div>
              <div class="edit-body">
                <textarea v-model="manualJSON" placeholder="简历 JSON 数据..."></textarea>
                <div class="template-selector">
                  <p>选择模板风格：</p>
                  <div class="tpl-btns">
                    <button :class="{active: currentTemplate === 0}" @click="setPreset(0)">经典</button>
                    <button :class="{active: currentTemplate === 1}" @click="setPreset(1)">圆角</button>
                    <button :class="{active: currentTemplate === 2}" @click="setPreset(2)">现代</button>
                  </div>
                </div>
                <button class="apply-btn" @click="applyManualEditOnly">保存修改</button>
              </div>
            </div>
          </div>
        </div>
      `
    });

    app.use(vant);
    app.mount('#app');
  }

  // 启动加载流程
  loadConfig().then(success => {
    if (success) {
      initApp();
    }
  });
})();
