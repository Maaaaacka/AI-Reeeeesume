/**
 * 语音畅聊模式模块
 * 依赖：XunfeiASR, XunfeiTTS, 全局 app 实例
 * 交互模式：免提连续对话，TTS 播完后自动进入下一轮聆听
 */

(function() {
  // 状态枚举
  const State = {
    IDLE: 'idle',           // 空闲，未启动
    LISTENING: 'listening', // 聆听中
    THINKING: 'thinking',   // AI 思考中
    SPEAKING: 'speaking'    // AI 播报中
  };

  class VoiceChatMode {
    constructor(config) {
      this.config = config;           // { asr, tts, onStateChange, onMessage, onError }
      this.state = State.IDLE;
      this.isActive = false;          // 是否处于语音畅聊模式
      this.abortController = null;    // 用于中断当前循环
      
      this.asr = config.asr;
      this.tts = config.tts;
      
      // 绑定方法
      this._loop = this._loop.bind(this);
    }

    // 启动语音畅聊模式
    async start() {
      if (this.isActive) return;
      this.isActive = true;
      this.abortController = new AbortController();
      this._setState(State.IDLE);
      
      console.log('🎧 语音畅聊模式已启动');
      // 开始第一轮循环
      this._loop();
    }

    // 停止语音畅聊模式
    stop() {
      this.isActive = false;
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      // 强制停止 ASR 和 TTS
      if (this.asr && this.asr.isRecording) {
        this.asr.stop();
      }
      // TTS 无法强制停止，但可以忽略后续回调
      this._setState(State.IDLE);
      console.log('🎧 语音畅聊模式已停止');
    }

    // 切换激活状态
    toggle() {
      if (this.isActive) {
        this.stop();
      } else {
        this.start();
      }
    }

    // 状态变更通知
    _setState(newState) {
      this.state = newState;
      if (this.config.onStateChange) {
        this.config.onStateChange(newState);
      }
    }

    // 主循环：聆听 → 思考 → 说话 → 循环
    async _loop() {
      // 检查是否应该继续
      if (!this.isActive) return;
      if (this.abortController?.signal.aborted) return;

      try {
        // ------------------ 1. 聆听阶段 ------------------
        this._setState(State.LISTENING);
        
        // 等待用户说话完成（静音自动断句）
        const userText = await this._listenForSpeech();
        
        // 检查中断或空输入
        if (!this.isActive || this.abortController?.signal.aborted) return;
        if (!userText || userText.trim() === '') {
          // 没识别到内容，直接重新聆听
          this._loop();
          return;
        }

        // 通知上层有新消息
        if (this.config.onMessage) {
          this.config.onMessage({ role: 'user', content: userText });
        }

        // ------------------ 2. 思考阶段 ------------------
        this._setState(State.THINKING);
        
        // 调用 AI 获取回复（由上层注入的处理函数）
        let aiReply = '';
        if (this.config.onProcessMessage) {
          aiReply = await this.config.onProcessMessage(userText);
        } else {
          aiReply = '抱歉，AI 服务未配置。';
        }

        if (!this.isActive || this.abortController?.signal.aborted) return;
        
        if (this.config.onMessage) {
          this.config.onMessage({ role: 'ai', content: aiReply });
        }

        // ------------------ 3. 说话阶段 ------------------
        this._setState(State.SPEAKING);
        
        // 播报 AI 回复，等待播报结束
        await this._speakText(aiReply);

        if (!this.isActive || this.abortController?.signal.aborted) return;

        // ------------------ 4. 循环继续 ------------------
        this._loop();
        
      } catch (error) {
        console.error('语音畅聊循环出错:', error);
        if (this.config.onError) {
          this.config.onError(error);
        }
        // 出错后短暂延迟再尝试继续
        if (this.isActive) {
          setTimeout(() => this._loop(), 1000);
        }
      }
    }

    // 使用 ASR 聆听，返回 Promise<识别文本>
    _listenForSpeech() {
      return new Promise((resolve, reject) => {
        if (!this.asr) {
          reject(new Error('ASR 未初始化'));
          return;
        }

        let finalText = '';
        
        // 临时覆盖 onResult 和 onError
        const originalOnResult = this.asr.onResult;
        const originalOnError = this.asr.onError;
        
        this.asr.onResult = (text, isFinal) => {
          finalText += text; // 累加增量文本
          // 可以实时显示部分识别结果（可选）
          if (this.config.onInterimText) {
            this.config.onInterimText(finalText);
          }
          if (isFinal) {
            // 识别结束，恢复原有回调
            this.asr.onResult = originalOnResult;
            this.asr.onError = originalOnError;
            resolve(finalText);
          }
        };
        
        this.asr.onError = (err) => {
          this.asr.onResult = originalOnResult;
          this.asr.onError = originalOnError;
          reject(err);
        };

        // 启动 ASR（如果已经在录音，先停止）
        if (this.asr.isRecording) {
          this.asr.stop();
        }
        this.asr.start().catch(reject);
      });
    }

    // 使用 TTS 播报文本，返回 Promise<播报结束>
    _speakText(text) {
      return new Promise((resolve, reject) => {
        if (!this.tts) {
          resolve(); // 无 TTS 直接跳过
          return;
        }
        
        // 如果文本过长，可以截断或不分段，这里简单处理
        if (text.length > 500) {
          console.warn('语音文本过长，截取前500字符');
          text = text.slice(0, 500);
        }
        
        this.tts.speak(text, {
          onStart: () => {},
          onEnd: resolve,
          onError: (err) => {
            console.warn('TTS 播报失败:', err);
            resolve(); // 即使失败也继续流程
          }
        });
      });
    }

    // 强制打断当前说话并开始聆听（用于用户主动打断）
    interrupt() {
      if (this.state === State.SPEAKING) {
        // 停止 TTS（由于 Audio 元素无法直接中断，我们只能停止当前播放并快速结束 Promise）
        // 这里通过重建 TTS 实例来达到中断效果，或者依赖上层提供的中断方法
        console.log('打断当前说话');
        // 简单做法：直接进入下一轮聆听，放弃本次循环的等待
        this.abortController?.abort();
        this.abortController = new AbortController();
        // 重新启动循环
        this._loop();
      } else if (this.state === State.THINKING) {
        // 思考中也可以打断，直接重新聆听（放弃本次请求）
        this.abortController?.abort();
        this.abortController = new AbortController();
        this._loop();
      }
    }
  }

  // 挂载到全局
  window.VoiceChatMode = VoiceChatMode;
})();
