// 自建色盘组件：细渐变环 + 中心预览
(function() {
  // HSL 转 HEX 工具函数
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
        hue: 0,
        brightness: 100,
        isDragging: false,
        canvasCtx: null,
        outerRadius: 120,
        innerRadius: 90,
      };
    },
    computed: {
      currentHex() {
        return hslToHex(this.hue, 100, this.brightness);
      }
    },
    watch: {
      currentHex(newVal) {
        this.$emit('update:modelValue', newVal);
      },
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

        // 绘制灰色背景（留白区域）
        ctx.fillStyle = '#f8f7f4';
        ctx.fillRect(0, 0, width, height);

        // 逐像素绘制色环（确保渐变连续且精确）
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            // 只在圆环范围内着色
            if (distance >= innerR && distance <= outerR) {
              let angle = Math.atan2(dy, dx) * 180 / Math.PI;
              if (angle < 0) angle += 360;
              // 固定饱和度100%，亮度50%显示纯色
              const rgb = this.hslToRgb(angle, 100, 50);
              const idx = (y * width + x) * 4;
              data[idx] = rgb[0];
              data[idx+1] = rgb[1];
              data[idx+2] = rgb[2];
              data[idx+3] = 255;
            } else {
              // 非环区域保持透明（让背景透出）
              const idx = (y * width + x) * 4;
              data[idx] = 248;
              data[idx+1] = 247;
              data[idx+2] = 244;
              data[idx+3] = 255;
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);

        // 绘制中心预览圆背景（白色）
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerR - 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e0e0e0';
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
        const radius = this.outerRadius - 4; // 放在环的外缘稍内

        // 计算指示器位置（角度转坐标）
        const rad = (this.hue - 90) * Math.PI / 180; // 0°指向顶部
        const x = centerX + Math.cos(rad) * radius;
        const y = centerY + Math.sin(rad) * radius;

        // 绘制指示器（带白色边框的小圆点）
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = this.currentHex;
        ctx.fill();
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
        // 只在环范围内更新
        if (distance >= this.innerRadius && distance <= this.outerRadius) {
          let angle = Math.atan2(dy, dx) * 180 / Math.PI;
          if (angle < 0) angle += 360;
          this.hue = angle;
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
