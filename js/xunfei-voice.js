/**
 * 讯飞语音集成插件 (ASR 语音识别 + TTS 语音合成)
 * 修复了 result_encoding 参数错误及 AudioContext 挂起问题
 */
(function() {
  // 辅助函数：将 ArrayBuffer 转为 Base64
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
        this.status = 0; // 重置状态为第一帧
        this.isRecording = true;

        this.ws.onopen = () => {
          console.log("ASR WebSocket 已连接");
          // 发送第一帧参数，去掉了不支持的 result_encoding
          const params = {
            common: { app_id: this.appid },
            business: { 
              language: 'zh_cn', 
              domain: 'iat', 
              accent: 'mandarin', 
              vad_eos: 3000 // 3秒静音自动切断
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
            this.onError?.(res.message);
            this.stop();
            return;
          }
          if (res.data && res.data.result) {
            // 解析结果：将讯飞返回的词组拼接成句子
            const text = res.data.result.ws.map(w => w.cw.map(c => c.w).join('')).join('');
            console.log("识别到片段:", text);
            // 触发回调，isLast 表示是否为最后一帧
            this.onResult?.(text, res.data.status === 2);
            if (res.data.status === 2) this.stop();
          }
        };

        this.ws.onerror = () => this.stop();
        this.ws.onclose = () => this.stop();

      } catch (err) {
        this.onError?.(err.message);
        this.stop();
      }
    }

    async setupAudioRecording() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 强制 16000 采样率
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        
        // 解决 Chrome 等浏览器因策略导致的 AudioContext 挂起
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        const source = this.audioContext.createMediaStreamSource(this.stream);
        // 使用 4096 缓冲区大小
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => {
          if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
          
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = this.toPCM(inputData);
          
          // 发送中间数据帧 (status: 1)
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
        this.onError?.("无法访问麦克风: " + err.message);
        this.stop();
      }
    }

    // 转换 Float32 为 Int16 (PCM格式)
    toPCM(input) {
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        // 使用小端字节序 (true)
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return new Uint8Array(buffer);
    }

    stop() {
      if (!this.isRecording) return;
      this.isRecording = false;

      // 发送结束帧 (status: 2)
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ 
          data: { status: 2, encoding: 'raw', format: 'audio/L16;rate=16000', audio: '' } 
        }));
        setTimeout(() => { if(this.ws) this.ws.close(); }, 500);
      }
      
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
    }
  }

  // --- 语音合成类 (TTS) - 稳定播放版本 ---
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
      return `wss://${host}/v2/tts?authorization=${btoa(authorizationOrigin)}&date=${encodeURIComponent(date)}&host=${host}`;
    }

    async speak(text, { onStart, onEnd, onError } = {}) {
      if (!text) return;
      try {
        const url = await this.generateAuthUrl('tts-api.xfyun.cn');
        const ws = new WebSocket(url);
        const audioChunks = [];

        ws.onopen = () => {
          const params = {
            common: { app_id: this.appid },
            business: {
              aue: 'lame', // 采用 MP3 格式，兼容性好
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
          if (res.code !== 0) {
            onError?.(res.message);
            ws.close();
            return;
          }
          if (res.data && res.data.audio) {
            const binary = atob(res.data.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            audioChunks.push(bytes);
            
            // 当接收到最后一帧
            if (res.data.status === 2) {
              const blob = new Blob(audioChunks, { type: 'audio/mp3' });
              const audioUrl = URL.createObjectURL(blob);
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                onEnd?.();
              };
              audio.play().catch(err => {
                console.warn("自动播放被拦截，请尝试点击页面激发：", err);
                onError?.("播放拦截");
              });
              ws.close();
            }
          }
        };

        ws.onerror = () => onError?.('TTS 连接失败');
      } catch (err) {
        onError?.(err.message);
      }
    }
  }

  // 挂载全局对象
  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
})();
