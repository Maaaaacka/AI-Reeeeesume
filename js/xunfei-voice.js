(function() {
  /**
   * 工具函数：将 ArrayBuffer 转为 Base64
   */
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // --- 语音识别类 (ASR) ---
  class XunfeiASR {
    constructor(config) {
      this.appid = config.appid;
      this.apiKey = config.apiKey;
      this.apiSecret = config.apiSecret;
      this.ws = null;
      this.audioContext = null;
      this.processor = null;
      this.stream = null;
      this.status = 0; 
      this.isRecording = false;
      
      this.onResult = null;
      this.onError = null;
    }

    async generateAuthUrl(host) {
      const date = new Date().toUTCString();
      const requestLine = `GET /v2/iat HTTP/1.1`;
      const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.apiSecret);
      const msgData = encoder.encode(signatureOrigin);

      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const signatureBase64 = arrayBufferToBase64(signature);

      const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
      const authorization = btoa(authorizationOrigin);

      return `wss://${host}/v2/iat?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
    }

    async start() {
      if (this.isRecording) return;
      try {
        const url = await this.generateAuthUrl('iat-api.xfyun.cn');
        this.ws = new WebSocket(url);
        this.status = 0;
        this.isRecording = true;

        this.ws.onopen = () => {
          console.log("ASR WebSocket 已连接，发送初始化参数...");
          // 第一帧：携带 business 核心参数（注意：已删除不支持的 result_encoding）
          const params = {
            common: { app_id: this.appid },
            business: { 
              language: 'zh_cn', 
              domain: 'iat', 
              accent: 'mandarin', 
              vad_eos: 5000 // 5秒静音自动切断
            },
            data: { 
              status: 0, 
              format: 'audio/L16;rate=16000', 
              encoding: 'raw' 
            }
          };
          this.ws.send(JSON.stringify(params));
          this.setupAudioRecording();
        };

        this.ws.onmessage = (e) => {
          const res = JSON.parse(e.data);
          if (res.code !== 0) {
            console.error("讯飞服务器返回错误:", res.message);
            this.onError?.(res.message);
            this.stop();
            return;
          }
          if (res.data && res.data.result) {
            // 解析讯飞的多维 JSON 结果
            const text = res.data.result.ws.map(w => w.cw.map(c => c.w).join('')).join('');
            console.log("识别到片段:", text);
            this.onResult?.(text, res.data.status === 2);
            if (res.data.status === 2) this.stop();
          }
        };

        this.ws.onerror = () => {
          this.onError?.('ASR WebSocket 连接异常');
          this.stop();
        };
        this.ws.onclose = () => this.stop();

      } catch (err) {
        this.onError?.(err.message);
        this.stop();
      }
    }

    async setupAudioRecording() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 确保采样率为讯飞要求的 16000
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        
        // 处理部分浏览器 AudioContext 启动时处于 suspended 的问题
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => {
          if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
          
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = this.toPCM(inputData);
          
          // 中间帧：status 设为 1
          this.ws.send(JSON.stringify({
            data: {
              status: 1,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: arrayBufferToBase64(pcmData.buffer)
            }
          }));
        };
      } catch (err) {
        this.onError?.("录音初始化失败: " + err.message);
        this.stop();
      }
    }

    /**
     * 将浏览器的 Float32 音频数据转为 16bit PCM (小端字节序)
     */
    toPCM(input) {
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return new Uint8Array(buffer);
    }

    stop() {
      if (!this.isRecording) return;
      this.isRecording = false;

      // 发送最后一帧（status: 2）告诉服务器结束
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ 
          data: { status: 2, encoding: 'raw', format: 'audio/L16;rate=16000', audio: '' } 
        }));
        // 延迟关闭 WS 确保最后一帧发出
        setTimeout(() => { if(this.ws) this.ws.close(); }, 500);
      }
      
      if (this.processor) { this.processor.disconnect(); this.processor = null; }
      if (this.audioContext) { 
        if (this.audioContext.state !== 'closed') this.audioContext.close(); 
        this.audioContext = null; 
      }
      if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    }
  }

  // --- 语音合成类 (TTS) - 严格使用已验证版本 ---
  class XunfeiTTS {
    constructor(config) {
      this.appid = config.appid;
      this.apiKey = config.apiKey;
      this.apiSecret = config.apiSecret;
    }

    async generateAuthUrl(host) {
      const date = new Date().toUTCString();
      const requestLine = `GET /v2/tts HTTP/1.1`;
      const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.apiSecret);
      const msgData = encoder.encode(signatureOrigin);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const signatureBase64 = arrayBufferToBase64(signature);
      const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
      const authorization = btoa(authorizationOrigin);
      return `wss://${host}/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
    }

    async speak(text, { onStart, onEnd, onError } = {}) {
      try {
        const url = await this.generateAuthUrl('tts-api.xfyun.cn');
        const ws = new WebSocket(url);
        const audioChunks = [];

        ws.onopen = () => {
          const params = {
            common: { app_id: this.appid },
            business: { 
              aue: 'lame', // 使用 MP3
              sfl: 1, 
              vcn: 'xiaoyan', 
              speed: 50, 
              volume: 50, 
              pitch: 50, 
              tte: 'UTF8' 
            },
            data: { 
              status: 2, 
              text: btoa(unescape(encodeURIComponent(text))) 
            }
          };
          ws.send(JSON.stringify(params));
          onStart?.();
        };

        ws.onmessage = (e) => {
          const res = JSON.parse(e.data);
          if (res.code !== 0) { onError?.(res.message); ws.close(); return; }
          if (res.data && res.data.audio) {
            const binary = atob(res.data.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            audioChunks.push(bytes);
            
            if (res.data.status === 2) {
              const blob = new Blob(audioChunks, { type: 'audio/mp3' });
              const audioUrl = URL.createObjectURL(blob);
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                onEnd?.();
              };
              audio.play().catch(err => onError?.('播放被拦截: ' + err.message));
              ws.close();
            }
          }
        };
        ws.onerror = () => onError?.('TTS 连接失败');
      } catch (err) { onError?.(err.message); }
    }
  }

  // 挂载到全局窗口对象
  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
})();
