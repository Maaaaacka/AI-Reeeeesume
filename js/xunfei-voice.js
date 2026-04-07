(function() {
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

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
      this.isProcessing = false; // 增加处理锁，防止重复 stop
      
      this.onResult = null;
      this.onError = null;
      this.onStop = null;
    }

    async generateAuthUrl() {
      const host = 'iat-api.xfyun.cn';
      const date = new Date().toUTCString();
      const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(this.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
      const signatureBase64 = arrayBufferToBase64(signature);
      const authOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
      return `wss://${host}/v2/iat?authorization=${btoa(authOrigin)}&date=${encodeURIComponent(date)}&host=${host}`;
    }

    async start() {
      if (this.isProcessing) return;
      try {
        this.status = 0;
        this.isProcessing = true;
        
        const url = await this.generateAuthUrl();
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("ASR WebSocket 已连接");
          this.setupAudioProcess();
        };

        this.ws.onmessage = (e) => {
          const res = JSON.parse(e.data);
          if (res.code !== 0) {
            this.onError?.(`识别错误: ${res.message}`);
            this.stop();
            return;
          }
          
          if (res.data && res.data.result) {
            const resultText = res.data.result.ws.map(w => w.cw.map(c => c.w).join('')).join('');
            // status 为 2 代表识别结束（可能是服务端 VAD 导致的）
            this.onResult?.(resultText, res.data.status === 2);
            if (res.data.status === 2) {
              this.stop();
            }
          }
        };

        this.ws.onerror = () => {
          this.onError?.("连接异常断开");
          this.stop();
        };

        this.ws.onclose = () => {
          console.log("ASR 连接已关闭");
        };

      } catch (err) {
        this.onError?.("启动失败: " + err.message);
        this.stop();
      }
    }

    async setupAudioProcess() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 采样率必须是 16000 才能被讯飞识别
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => {
          if (!this.isProcessing || this.ws.readyState !== WebSocket.OPEN) return;

          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = this.toPCM(inputData);
          
          const frame = {
            data: {
              status: this.status,
              format: "audio/L16;rate=16000",
              encoding: "raw",
              audio: arrayBufferToBase64(pcmData.buffer)
            }
          };

          if (this.status === 0) {
            frame.common = { app_id: this.appid };
            frame.business = {
              language: "zh_cn",
              domain: "iat",
              accent: "mandarin",
              vinfo: 1,
              vad_eos: 5000 // 调高 VAD 时间到 5 秒，防止还没说话就断开
            };
            this.status = 1;
          }

          this.ws.send(JSON.stringify(frame));
        };
      } catch (err) {
        this.onError?.("录音权限被拒绝或初始化失败");
        this.stop();
      }
    }

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
      if (!this.isProcessing) return; // 关键：如果已经不在处理中，直接跳过
      this.isProcessing = false;

      // 1. 通知服务端结束
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" }
        }));
      }

      // 2. 延迟关闭连接，给最后一帧一点传输时间
      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
      }, 500);

      // 3. 安全关闭 AudioContext
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(e => console.warn("关闭AudioContext失败:", e));
        this.audioContext = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      this.onStop?.();
    }
  }

  // TTS 类保持不变...
  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
})();
