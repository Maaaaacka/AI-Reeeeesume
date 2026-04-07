(function() {
  // 辅助函数：将 ArrayBuffer 转为 Base64
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
      this.status = 0; // 0: 第一帧, 1: 中间帧, 2: 最后一帧
      
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
      try {
        // 1. 获取麦克风权限
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 2. 建立 WebSocket
        const url = await this.generateAuthUrl();
        this.ws = new WebSocket(url);
        this.status = 0;

        this.ws.onopen = () => {
          console.log("ASR WebSocket 已连接");
          this.setupAudioProcess();
        };

        this.ws.onmessage = (e) => {
          const res = JSON.parse(e.data);
          if (res.code !== 0) {
            this.onError?.(`讯飞报错: ${res.message} (代码: ${res.code})`);
            this.stop();
            return;
          }
          
          if (res.data && res.data.result) {
            // 解析讯飞复杂的嵌套识别结果
            const resultText = res.data.result.ws.map(w => w.cw.map(c => c.w).join('')).join('');
            const isFinal = res.data.status === 2;
            this.onResult?.(resultText, isFinal);
            
            if (isFinal) {
              console.log("识别完成");
              this.stop();
            }
          }
        };

        this.ws.onerror = (e) => this.onError?.("WebSocket 连接发生错误");
        this.ws.onclose = () => console.log("ASR 连接已关闭");

      } catch (err) {
        this.onError?.("无法启动录音: " + err.message);
      }
    }

    setupAudioProcess() {
      // 创建 AudioContext，尽量尝试 16000 采样率
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      
      // 使用最新的 AudioWorklet 会比较复杂，此处使用 ScriptProcessor 保证兼容性
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        if (this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // 降采样逻辑：如果浏览器依然给了 48k 数据，手动转为 16k（虽然指定了 sampleRate，但防范于未然）
        // 简单的线性转化
        const pcmData = this.toPCM(inputData);
        const base64Audio = arrayBufferToBase64(pcmData.buffer);

        let frame = {
          data: {
            status: this.status,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: base64Audio
          }
        };

        // 如果是第一帧，需要携带 common 和 business 参数
        if (this.status === 0) {
          frame.common = { app_id: this.appid };
          frame.business = {
            language: "zh_cn",
            domain: "iat",
            accent: "mandarin",
            vinfo: 1,
            vad_eos: 2000 // 2秒静音自动切断
          };
          this.status = 1; // 发送完第一帧后状态改为中间帧
        }

        this.ws.send(JSON.stringify(frame));
      };
    }

    // 将 Float32 转为 16bit PCM
    toPCM(input) {
      let offset = 0;
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return new Uint8Array(buffer);
    }

    stop() {
      if (this.status !== 2 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        // 发送最后一帧空数据告知结束
        this.ws.send(JSON.stringify({
          data: { status: 2, format: "audio/L16;rate=16000", encoding: "raw", audio: "" }
        }));
      }
      this.status = 2;
      
      // 释放资源
      this.processor?.disconnect();
      this.audioContext?.close();
      this.stream?.getTracks().forEach(track => track.stop());
      this.onStop?.();
    }
  }

  // --- TTS 部分保持之前的逻辑，因为用户反馈可行 ---
  class XunfeiTTS {
    constructor(config) {
      this.appid = config.appid;
      this.apiKey = config.apiKey;
      this.apiSecret = config.apiSecret;
    }

    async generateAuthUrl() {
      const host = 'tts-api.xfyun.cn';
      const date = new Date().toUTCString();
      const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(this.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
      const signatureBase64 = arrayBufferToBase64(signature);
      const authOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
      return `wss://${host}/v2/tts?authorization=${btoa(authOrigin)}&date=${encodeURIComponent(date)}&host=${host}`;
    }

    async speak(text, { onStart, onEnd, onError } = {}) {
      try {
        const url = await this.generateAuthUrl();
        const ws = new WebSocket(url);
        const audioChunks = [];

        ws.onopen = () => {
          const params = {
            common: { app_id: this.appid },
            business: { aue: 'lame', sfl: 1, vcn: 'xiaoyan', speed: 50, volume: 50, pitch: 50, tte: 'UTF8' },
            data: { status: 2, text: btoa(unescape(encodeURIComponent(text))) }
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
              const audio = new Audio(URL.createObjectURL(blob));
              audio.onended = onEnd;
              audio.play().catch(onError);
              ws.close();
            }
          }
        };
      } catch (err) { onError?.(err.message); }
    }
  }

  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
})();
