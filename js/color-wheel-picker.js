// 自建色盘组件：60色扇形色盘 + 亮度滑块 + 预设联动
(function() {
  // HSL 与 HEX 互转工具函数
  function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = (x) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToHsl(hex) {
    // 移除 # 并转为 RGB
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0; // 灰色
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  const ColorWheelPicker = {
    name: 'ColorWheelPicker',
    props: {
      modelValue: { type: String, default: '#6C8EB2' }
    },
    emits: ['update:modelValue'],
    template: `
      <div class="custom-color-picker">
        <canvas ref="canvas" width="240" height="240" class="color-wheel"
                @touchstart="onTouch" @touchmove="onTouch" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
        </canvas>
        <div class="brightness-slider">
          <input type="range" min="0" max="100" v-model.number="brightness" class="slider" />
        </div>
        <div class="color-preview" :style="{ backgroundColor: currentHex }"></div>
      </div>
    `,
    data() {
      return {
        hue: 0,                // 0-360
        brightness: 100,       // 0-100
        isDragging: false,
        canvasCtx: null,
        totalSegments: 60,
        gapDegrees: 1,
      };
    },
    computed: {
      currentHex() {
        // 固定饱和度100%，亮度为当前亮度
        return hslToHex(this.hue, 100, this.brightness);
      },
      segmentDegrees() {
        return 360 / this.totalSegments;
      },
      fillDegrees() {
        return this.segmentDegrees - this.gapDegrees;
      }
    },
    watch: {
      modelValue: {
        immediate: true,
        handler(newHex) {
          // 外部颜色变化时，解析HSL更新内部状态
          if (newHex && newHex.startsWith('#')) {
            const { h, s, l } = hexToHsl(newHex);
            // 只更新色相和亮度，饱和度固定为100%以匹配色环（可根据需求保留饱和度，但色环显示固定饱和度）
            this.hue = h;
            this.brightness = l;
            // 饱和度暂时忽略，保持色环一致性
          }
        }
      },
      currentHex(newVal) {
        this.$emit('update:modelValue', newVal);
      }
    },
    mounted() {
      this.initCanvas();
    },
    methods: {
      initCanvas() {
        const canvas = this.$refs.canvas;
        this.canvasCtx = canvas.getContext('2d');
        this.drawWheel();
      },
      drawWheel() {
        const canvas = this.$refs.canvas;
        const ctx = this.canvasCtx;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 2;

        // 清除画布
        ctx.clearRect(0, 0, width, height);

        // 绘制背景（留白区域的底色）
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);

        // 绘制60个扇形色块（固定亮度50%以便清晰显示色相）
        for (let i = 0; i < this.totalSegments; i++) {
          const startAngle = (i * this.segmentDegrees) * Math.PI / 180;
          const endAngle = (i * this.segmentDegrees + this.fillDegrees) * Math.PI / 180;

          // 扇形中间角度作为色相
          const hueAngle = i * this.segmentDegrees + this.fillDegrees / 2;
          // 固定饱和度100%，亮度50%绘制色环
          const rgb = this.hslToRgb(hueAngle, 100, 50);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, startAngle, endAngle);
          ctx.closePath();
          ctx.fill();
        }

        // 绘制中心小圆（用于放置亮度预览）
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        this.drawIndicator();
      },
      hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        if (s === 0) {
          r = g = b = l;
        } else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
      },
      drawIndicator() {
        const canvas = this.$refs.canvas;
        const ctx = this.canvasCtx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width / 2 - 4;

        // 计算指示器位置：hue 0° 对应正北，但canvas中0°是正东，所以需要转换
        // 将 hue 转换为 canvas 角度：canvasAngle = (hue - 90) 度
        const rad = (this.hue - 90) * Math.PI / 180;
        const x = centerX + Math.cos(rad) * (radius - 10);
        const y = centerY + Math.sin(rad) * (radius - 10);

        // 绘制外圈
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        // 内圈显示当前亮度颜色
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = this.currentHex;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      },
      updateHueFromEvent(e) {
        const canvas = this.$refs.canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const radius = canvas.width / 2 - 2;
        if (distance <= radius) {
          // 计算相对于中心的角度（标准数学角，0°正东）
          let angle = Math.atan2(dy, dx) * 180 / Math.PI;
          if (angle < 0) angle += 360;
          // 转换为色相：色相0°对应正北，而数学角0°正东，所以 hue = (angle + 90) % 360
          let hue = (angle + 90) % 360;
          // 对齐到最近的扇区中心
          const segmentIndex = Math.floor(hue / this.segmentDegrees);
          const segmentCenter = segmentIndex * this.segmentDegrees + this.fillDegrees / 2;
          this.hue = segmentCenter % 360;
          this.redraw();
        }
      },
      redraw() {
        this.drawWheel();
      },
      onTouch(e) {
        e.preventDefault();
        this.updateHueFromEvent(e);
      },
      onMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.updateHueFromEvent(e);
      },
      onMouseMove(e) {
        if (this.isDragging) {
          e.preventDefault();
          this.updateHueFromEvent(e);
        }
      },
      onMouseUp() {
        this.isDragging = false;
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.ColorWheelPicker = ColorWheelPicker;
  }
})();
