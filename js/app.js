(function() {
  const { createApp, ref, reactive, nextTick, watch, onMounted, computed, onUnmounted } = Vue;

  let API_CONFIG = null;
  let XUNFEI_CONFIG = null;

  async function loadConfig() {
    try {
      const response = await fetch('api-config.json'); // 确保路径与你的目录结构一致
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json();
      API_CONFIG = config.deepseek;
      XUNFEI_CONFIG = config.xunfei;
      return true;
    } catch (error) {
      console.error('加载配置文件失败:', error);
      return false;
    }
  }

  const App = {
    setup() {
      const userInput = ref('');
      const messages = reactive([]);
      const isGenerating = ref(false);
      const isRecording = ref(false);
      
      // 实例引用
      let asr = null;
      let tts = null;

      // 发送消息逻辑
      const handleSendMessage = async () => {
        if (!userInput.value.trim() || isGenerating.value) return;

        const userText = userInput.value;
        messages.push({ role: 'user', content: userText });
        userInput.value = '';
        isGenerating.value = true;

        try {
          const response = await fetch(API_CONFIG.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${API_CONFIG.key}`
            },
            body: JSON.stringify({
              model: API_CONFIG.model,
              messages: [{ role: 'user', content: userText }],
              stream: false
            })
          });

          const data = await response.json();
          const aiReply = data.choices[0].message.content;
          
          messages.push({ role: 'assistant', content: aiReply });

          // AI 回复后自动播报
          if (!tts) tts = new XunfeiTTS(XUNFEI_CONFIG);
          tts.speak(aiReply);

        } catch (error) {
          console.error("API请求失败:", error);
          vant.showToast('请求失败，请检查网络');
        } finally {
          isGenerating.value = false;
        }
      };

      // 语音按钮切换逻辑
      const toggleVoice = async () => {
        if (isRecording.value) {
          // 停止录音
          if (asr) asr.stop();
          isRecording.value = false;
        } else {
          // 开始录音
          if (!asr) {
            asr = new XunfeiASR(XUNFEI_CONFIG);
            
            // --- 核心修改部分：对接 ASR 回调 ---
            asr.onResult = (text, isLast) => {
              if (text) {
                // 实时更新输入框内容
                userInput.value = text;
                
                // 如果识别判定为最后一句话，自动发送
                if (isLast) {
                  console.log("语音识别完成，自动发送:", text);
                  isRecording.value = false; // 重置按钮状态
                  handleSendMessage();
                }
              }
            };

            asr.onError = (err) => {
              console.error("识别错误:", err);
              isRecording.value = false;
              vant.showToast('识别出错: ' + err);
            };
          }

          try {
            await asr.start();
            isRecording.value = true;
            vant.showToast('正在倾听...');
          } catch (err) {
            vant.showToast('无法启动录音');
          }
        }
      };

      return {
        userInput,
        messages,
        isGenerating,
        isRecording,
        handleSendMessage,
        toggleVoice
      };
    },
    template: `
      <div class="app-container">
        <div class="chat-messages" ref="chatBox">
          <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
            <div class="message-content">{{ msg.content }}</div>
          </div>
          <div v-if="isGenerating" class="message assistant">
            <div class="message-content loading-dots">思考中</div>
          </div>
        </div>

        <div class="input-area">
          <div class="input-wrapper">
            <input 
              v-model="userInput" 
              type="text" 
              placeholder="问点什么..." 
              @keyup.enter="handleSendMessage"
            >
            <button 
              :class="['voice-btn', { 'recording': isRecording }]" 
              @click="toggleVoice"
            >
              <i class="icon-mic"></i>
            </button>
            <button class="send-btn" @click="handleSendMessage" :disabled="isGenerating">
              发送
            </button>
          </div>
        </div>
      </div>
    `
  };

  // 初始化应用
  loadConfig().then(success => {
    if (success) {
      const app = createApp(App);
      app.use(vant);
      app.mount('#app');
    } else {
      document.body.innerHTML = "配置加载失败，请检查 api-config.json";
    }
  });

})();
