(function() {
  let XUNFEI_CONFIG = null;

  function loadConfig() {
    return new Promise((resolve, reject) => {
      if (XUNFEI_CONFIG) {
        resolve(XUNFEI_CONFIG);
        return;
      }

      fetch('config/api-config.json')
        .then(response => response.json())
        .then(config => {
          XUNFEI_CONFIG = config.xunfei;
          resolve(XUNFEI_CONFIG);
        })
        .catch(error => {
          console.error('加载讯飞配置失败:', error);
          reject(error);
        });
    });
  }

  class XunfeiASR {
    constructor(config) {
      this.appid = config.appid;
      this.apiKey = config.apiKey;
      this.apiSecret = config.apiSecret;
      this.ws = null;
      this.mediaRecorder = null;
      this.audioStream = null;
      this.isRecording = false;
      this.onResult = null;
      this.onError = null;
      this.onVolumeChange = null;
    }

    generateAuthUrl() {
      const host = 'iat-api.xfyun.cn';
      const date = new Date().toUTCString();
      const requestLine = 'GET /v2/iat HTTP/1.1';
      
      const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
      
      const crypto = window.crypto || window.msCrypto;
      const encoder = new TextEncoder();
      
      return new Promise((resolve, reject) => {
        crypto.subtle.importKey(
          'raw',
          encoder.encode(this.apiSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        ).then(key => {
          return crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
        }).then(signature => {
          const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
          
          const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
          const authorization = btoa(authorizationOrigin);
          
          const url = `wss://${host}/v2/iat?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
          resolve(url);
        }).catch(reject);
      });
    }

    async start(onResult, onError, onVolumeChange) {
      this.onResult = onResult;
      this.onError = onError;
      this.onVolumeChange = onVolumeChange;
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioStream = stream;
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!this.isRecording) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const volume = Math.min(100, Math.floor(avg / 2.55));
          if (this.onVolumeChange) this.onVolumeChange(volume);
          requestAnimationFrame(checkVolume);
        };
        checkVolume();
        
        const wsUrl = await this.generateAuthUrl();
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          this.isRecording = true;
          this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
          });
          
          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(event.data);
            }
          };
          
          this.mediaRecorder.start(100);
          
          const startParams = {
            common: { app_id: this.appid },
            business: {
              language: 'zh_cn',
              domain: 'iat',
              accent: 'mandarin',
              vad_eos: 2000,
              dwa: 'wpgs'
            },
            data: {
              status: 0,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: ''
            }
          };
          this.ws.send(JSON.stringify(startParams));
        };
        
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.code === 0 && data.data && data.data.result) {
            let text = '';
            if (data.data.result.ws) {
              for (const ws of data.data.result.ws) {
                for (const cw of ws.cw) {
                  text += cw.w;
                }
              }
            }
            if (text && this.onResult) {
              this.onResult(text, data.data.result.pgs === 'apd');
            }
          } else if (data.code !== 0) {
            if (this.onError) this.onError(data.message || '识别错误');
          }
        };
        
        this.ws.onerror = (error) => {
          if (this.onError) this.onError('WebSocket连接错误');
        };
        
      } catch (error) {
        if (this.onError) this.onError('麦克风访问失败: ' + error.message);
      }
    }
    
    stop() {
      this.isRecording = false;
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const endParams = {
          data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
        };
        this.ws.send(JSON.stringify(endParams));
        setTimeout(() => this.ws.close(), 100);
      }
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }
    }
  }

  class XunfeiTTS {
    constructor(config) {
      this.appid = config.appid;
      this.apiKey = config.apiKey;
      this.apiSecret = config.apiSecret;
    }
    
    generateAuthUrl() {
      const host = 'tts-api.xfyun.cn';
      const date = new Date().toUTCString();
      const requestLine = 'GET /v2/tts HTTP/1.1';
      
      const signatureOrigin = `host: ${host}\ndate: ${date}\n${requestLine}`;
      const encoder = new TextEncoder();
      const crypto = window.crypto || window.msCrypto;
      
      return new Promise((resolve, reject) => {
        crypto.subtle.importKey(
          'raw',
          encoder.encode(this.apiSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        ).then(key => {
          return crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
        }).then(signature => {
          const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
          const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
          const authorization = btoa(authorizationOrigin);
          const url = `wss://${host}/v2/tts?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
          resolve(url);
        }).catch(reject);
      });
    }
    
    async speak(text, onStart, onEnd, onError) {
      try {
        const wsUrl = await this.generateAuthUrl();
        const ws = new WebSocket(wsUrl);
        let audioChunks = [];
        
        ws.onopen = () => {
          const params = {
            common: { app_id: this.appid },
            business: {
              aue: 'raw',
              auf: 'audio/L16;rate=16000',
              vcn: 'xiaoyan',
              speed: 50,
              volume: 50,
              pitch: 50
            },
            data: {
              status: 2,
              text: btoa(unescape(encodeURIComponent(text)))
            }
          };
          ws.send(JSON.stringify(params));
          if (onStart) onStart();
        };
        
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.code === 0 && data.data && data.data.audio) {
            const audioData = Uint8Array.from(atob(data.data.audio), c => c.charCodeAt(0));
            audioChunks.push(audioData);
            
            if (data.data.status === 2) {
              const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                if (onEnd) onEnd();
              };
              audio.play();
              ws.close();
            }
          } else if (data.code !== 0) {
            if (onError) onError(data.message);
          }
        };
        
        ws.onerror = () => {
          if (onError) onError('语音合成连接错误');
        };
        
      } catch (error) {
        if (onError) onError(error.message);
      }
    }
  }

  window.XunfeiASR = XunfeiASR;
  window.XunfeiTTS = XunfeiTTS;
  window.loadXunfeiConfig = loadConfig;
})();
