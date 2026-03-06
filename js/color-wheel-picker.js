// HSL颜色选择器组件：60色留白细环 + 饱和度滑块 + 亮度滑块 + 预设联动
(function() {
  // HSL <-> HEX 转换工具函数
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
        <!-- 色环画布 -->
        <canvas ref="canvas" width="240" height="240" class="color-wheel"
                @touchstart="onTouch" @touchmove="onTouch" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
        </canvas>

        <!-- 饱和度滑块 -->
        <div class="slider-container saturation-slider">
          <input type="range" min="0" max="100" v-model.number="saturation" class="slider" :style="{ background: saturationGradient }" />
        </div>

        <!-- 亮度滑块 -->
        <div class="slider-container lightness-slider">
          <input type="range" min="0" max="100" v-model.number="lightness" class="slider" :style="{ background: lightnessGradient }" />
        </div>

        <!-- 当前颜色预览 -->
        <div class="color-preview" :style="{ backgroundColor: currentHex }"></div>
      </div>
    `,
    data() {
      return {
        hue: 0,                // 0-360
        saturation: 100,       // 0-100
        lightness: 50,         // 0-100
        isDragging: false,
        canvasCtx: null,
        totalSegments: 60,     // 60个色块
        gapDegrees: 1,         // 留白间隙1度
        outerRadius: 120,      // 外径
        innerRadius: 100,      // 内径（环宽20px）
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
        // 饱和度滑块背景：从当前亮度下的灰色到纯色
        const from = `hsl(${this.hue}, 0%, ${this.lightness}%)`;
        const to = `hsl(${this.hue}, 100%, ${this.lightness}%)`;
        return `linear-gradient(90deg, ${from}, ${to})`;
      },
      lightnessGradient() {
        // 亮度滑块背景：从黑色到当前色相&饱和度下的纯色
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
      hue() {
        this.redraw();
      },
      saturation() {
        this.redraw();
      },
      lightness() {
        this.redraw();
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
        const outerR = this.outerRadius;
        const innerR = this.innerRadius;

        // 清除画布
        ctx.clearRect(0, 0, width, height);

        // 绘制背景（留白区域的底色）
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);

        // 绘制60个扇形色块（颜色由当前饱和度、亮度、扇区中心色相决定）
        for (let i = 0; i < this.totalSegments; i++) {
          const startAngle = (i * this.segmentDegrees) * Math.PI / 180;
          const endAngle = (i * this.segmentDegrees + this.fillDegrees) * Math.PI / 180;

          // 扇形中间角度作为色相
          const sectorHue = (i * this.segmentDegrees + this.fillDegrees / 2) % 360;
          // 根据当前饱和度和亮度计算颜色
          const rgb = this.hslToRgb(sectorHue, this.saturation, this.lightness);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, outerR, startAngle, endAngle);
          ctx.lineTo(centerX, centerY);
          ctx.closePath();
          ctx.fill();

          // 绘制内圆留白（切出环状）
          ctx.beginPath();
          ctx.arc(centerX, centerY, innerR, 0, 2 * Math.PI);
          ctx.fillStyle = '#f0f0f0';
          ctx.fill();
        }

        // 绘制中心小圆（可选，用于放置亮度预览，但已被内圆覆盖，可不画）
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerR - 2, 0, 2 * Math.PI);
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
        const canvas = this.$refs.canvas;
        const ctx = this.canvasCtx;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = this.outerRadius - 6; // 指示器放在环外缘稍内

        // 计算指示器位置：hue 0° 正北，canvas角度0°正东，转换：canvasAngle = (hue - 90)
        const rad = (this.hue - 90) * Math.PI / 180;
        const x = centerX + Math.cos(rad) * radius;
        const y = centerY + Math.sin(rad) * radius;

        // 绘制指示器（外圈白边，内圈当前颜色）
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
        // 确保点击在环内
        if (distance >= this.innerRadius && distance <= this.outerRadius) {
          // 计算数学角（0°正东）
          let mathAngle = Math.atan2(dy, dx) * 180 / Math.PI;
          if (mathAngle < 0) mathAngle += 360;
          // 转换为色相（正北为0°）
          let hue = (mathAngle + 90) % 360;
          // 对齐到最近的扇区中心
          const segmentIndex = Math.floor(hue / this.segmentDegrees);
          const segmentCenter = segmentIndex * this.segmentDegrees + this.fillDegrees / 2;
          this.hue = segmentCenter % 360;
          this.redraw();
        }
      },
      redraw() {
        // 使用 requestAnimationFrame 避免频繁重绘
        if (this._redrawTimer) cancelAnimationFrame(this._redrawTimer);
        this._redrawTimer = requestAnimationFrame(() => {
          this.drawWheel();
          this._redrawTimer = null;
        });
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
