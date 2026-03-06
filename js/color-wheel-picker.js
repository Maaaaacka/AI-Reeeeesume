// HSL颜色选择器组件：60色留白细环 + 饱和度滑块 + 亮度滑块 + 预设联动（高分屏适配 + 全局拖拽 + 颜色精准映射）
(function() {
  // HSL <-> HEX 转换工具函数（保持不变）
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
      h = s = 0;
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
    return {
      h: Math.round(h),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  const ColorWheelPicker = {
    name: 'ColorWheelPicker',
    props: {
      modelValue: { type: String, default: '#6C8EB2' }
    },
    emits: ['update:modelValue'],
    template: `
      <div class="custom-color-picker">
        <canvas ref="canvas" class="color-wheel"
                @touchstart="onTouchStart" @mousedown="onMouseDown">
        </canvas>
        <div class="slider-container saturation-slider">
          <input type="range" min="0" max="100" v-model.number="saturation" class="slider" :style="{ background: saturationGradient }" />
        </div>
        <div class="slider-container lightness-slider">
          <input type="range" min="0" max="100" v-model.number="lightness" class="slider" :style="{ background: lightnessGradient }" />
        </div>
        <div class="color-preview" :style="{ backgroundColor: currentHex }"></div>
      </div>
    `,
    data() {
      return {
        hue: 0,
        saturation: 100,
        lightness: 50,
        isDragging: false,
        canvasCtx: null,
        totalSegments: 60,
        gapDegrees: 1,
        outerRadius: 120,
        innerRadius: 100,
        dpr: 1,
      };
    },
    computed: {
      currentHex() {
        return hslToHex(this.hue, this.saturation, this.lightness);
      },
      segmentDegrees() {
        return 360 / this.totalSegments;
      },
      fillDegrees() {
        return this.segmentDegrees - this.gapDegrees;
      },
      saturationGradient() {
        const from = `hsl(${this.hue}, 0%, ${this.lightness}%)`;
        const to = `hsl(${this.hue}, 100%, ${this.lightness}%)`;
        return `linear-gradient(90deg, ${from}, ${to})`;
      },
      lightnessGradient() {
        const from = `hsl(${this.hue}, ${this.saturation}%, 0%)`;
        const to = `hsl(${this.hue}, ${this.saturation}%, 100%)`;
        return `linear-gradient(90deg, ${from}, ${to})`;
      }
    },
    watch: {
      modelValue: {
        immediate: true,
        handler(newHex) {
          if (newHex && newHex.startsWith('#')) {
            const { h, s, l } = hexToHsl(newHex);
            this.hue = h;
            this.saturation = s;
            this.lightness = l;
          }
        }
      },
      currentHex(newVal) {
        this.$emit('update:modelValue', newVal);
      },
      hue() { this.redraw(); },
      saturation() { this.redraw(); },
      lightness() { this.redraw(); }
    },
    mounted() {
      this.dpr = window.devicePixelRatio || 1;
      this.initCanvas();
      window.addEventListener('touchmove', this.onGlobalTouchMove, { passive: false });
      window.addEventListener('touchend', this.onGlobalTouchEnd);
      window.addEventListener('mousemove', this.onGlobalMouseMove);
      window.addEventListener('mouseup', this.onGlobalMouseUp);
    },
    unmounted() {
      window.removeEventListener('touchmove', this.onGlobalTouchMove);
      window.removeEventListener('touchend', this.onGlobalTouchEnd);
      window.removeEventListener('mousemove', this.onGlobalMouseMove);
      window.removeEventListener('mouseup', this.onGlobalMouseUp);
    },
    methods: {
      initCanvas() {
        const canvas = this.$refs.canvas;
        const ctx = canvas.getContext('2d');
        this.canvasCtx = ctx;

        const logicalWidth = 240;
        const logicalHeight = 240;
        canvas.width = logicalWidth * this.dpr;
        canvas.height = logicalHeight * this.dpr;
        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = logicalHeight + 'px';

        ctx.scale(this.dpr, this.dpr);
        this.drawWheel();
      },
      drawWheel() {
        const ctx = this.canvasCtx;
        const width = 240;
        const height = 240;
        const centerX = width / 2;
        const centerY = height / 2;
        const outerR = this.outerRadius;
        const innerR = this.innerRadius;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < this.totalSegments; i++) {
          const startAngle = (i * this.segmentDegrees) * Math.PI / 180;
          const endAngle = (i * this.segmentDegrees + this.fillDegrees) * Math.PI / 180;

          // 扇区中心角度（正东为0°）
          const centerMathAngle = i * this.segmentDegrees + this.fillDegrees / 2;
          // 转换为色相（正北为0°）
          const sectorHue = (centerMathAngle + 90) % 360;

          const rgb = this.hslToRgb(sectorHue, this.saturation, this.lightness);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
          ctx.closePath();
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(centerX, centerY, innerR, 0, 2 * Math.PI);
        ctx.fillStyle = '#f0f0f0';
        ctx.fill();

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
        const ctx = this.canvasCtx;
        const centerX = 120;
        const centerY = 120;
        const radius = this.outerRadius - 6;

        const rad = (this.hue - 90) * Math.PI / 180;
        const x = centerX + Math.cos(rad) * radius;
        const y = centerY + Math.sin(rad) * radius;

        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = this.currentHex;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      },
      updateHueFromEvent(clientX, clientY) {
        const canvas = this.$refs.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (canvas.width / rect.width) / this.dpr;
        const y = (clientY - rect.top) * (canvas.height / rect.height) / this.dpr;

        const centerX = 120;
        const centerY = 120;
        const dx = x - centerX;
        const dy = y - centerY;

        // 数学角（0°正东）
        let mathAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (mathAngle < 0) mathAngle += 360;

        // 根据数学角找到扇区索引
        const segmentIndex = Math.floor(mathAngle / this.segmentDegrees) % this.totalSegments;
        // 该扇区中心对应的数学角
        const centerMathAngle = segmentIndex * this.segmentDegrees + this.fillDegrees / 2;
        // 转换为色相（正北为0°）
        this.hue = (centerMathAngle + 90) % 360;

        this.redraw();
      },
      onTouchStart(e) {
        e.preventDefault();
        this.isDragging = true;
        const touch = e.touches[0];
        this.updateHueFromEvent(touch.clientX, touch.clientY);
      },
      onGlobalTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          this.updateHueFromEvent(touch.clientX, touch.clientY);
        }
      },
      onGlobalTouchEnd() {
        this.isDragging = false;
      },
      onMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.updateHueFromEvent(e.clientX, e.clientY);
      },
      onGlobalMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateHueFromEvent(e.clientX, e.clientY);
      },
      onGlobalMouseUp() {
        this.isDragging = false;
      },
      redraw() {
        if (this._redrawTimer) cancelAnimationFrame(this._redrawTimer);
        this._redrawTimer = requestAnimationFrame(() => {
          this.drawWheel();
          this._redrawTimer = null;
        });
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.ColorWheelPicker = ColorWheelPicker;
  }
})();
