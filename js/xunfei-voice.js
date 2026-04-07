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
      this.scriptProcessor = null;
      this.stream = null;
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
      try {
        const url = await this.generateAuthUrl('iat-api.xfyun.cn');
        this.ws = new WebSocket(url);
        this.isRecording = true;

        this.ws.onopen = () => {
          // 发送第一帧参数
          const params = {
            common: { app_id: this.appid },
            business: { language: 'zh_cn', domain: 'iat', accent: 'mandarin', vad_eos: 3000, result_encoding: 'unicode' },
            data: { status: 0, format: 'audio/L16;rate=16000', encoding: 'raw' }
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
            const text = res.data.result.ws.map(w => w.cw.map(c => c.w).join('')).join('');
            this.onResult?.(text, res.data.status === 2);
            if (res.data.status === 2) this.stop();
          }
        };

        this.ws.onerror = () => this.onError?.('WebSocket 连接失败');
        this.ws.onclose = () => this.stop();

      } catch (err) {
        this.onError?.(err.message);
      }
    }

    async setupAudioRecording() {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 关键：强制采样率为 16000
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      
      // 创建处理节点
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isRecording || this.ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // 将 Float32 转为 Int16 (PCM)
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        this.ws.send(JSON.stringify({
          data: {
            status: 1,
            format: 'audio/L16;rate=16000',
            encoding: 'raw',
            audio: arrayBufferToBase64(pcmData.buffer)
          }
        }));
      };
    }

    stop() {
      this.isRecording = false;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ data: { status: 2, encoding: 'raw', format: 'audio/L16;rate=16000', audio: '' } }));
      }
      this.scriptProcessor?.disconnect();
      this.audioContext?.close();
      this.stream?.getTracks().forEach(t => t.stop());
    }
  }

  // --- 语音合成类 (TTS) ---
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

      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
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
              aue: 'lame', // 关键：使用 MP3 格式，浏览器兼容性最好
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
            
            if (res.data.status === 2) {
              const blob = new Blob(audioChunks, { type: 'audio/mp3' });
              const audioUrl = URL.createObjectURL(blob);
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                onEnd?.();
              };
              audio.play().catch(err => onError?.('播放被浏览器拦截: ' + err.message));
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

  // 挂载到全局
  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
})();
