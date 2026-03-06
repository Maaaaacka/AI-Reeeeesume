// 自建色盘组件：60色扇形色盘 + 亮度滑块
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
        hue: 0,            // 0-360
        brightness: 100,   // 0-100
        isDragging: false,
        canvasCtx: null,
        totalSegments: 60,      // 60个色块
        gapDegrees: 1,          // 每个色块之间留白1度
      };
    },
    computed: {
      currentHex() {
        return hslToHex(this.hue, 100, this.brightness);
      },
      segmentDegrees() {
        // 每个色块占据的角度（包括留白）
        return 360 / this.totalSegments;
      },
      fillDegrees() {
        // 实际填充颜色的角度（去除留白）
        return this.segmentDegrees - this.gapDegrees;
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
        const radius = Math.min(width, height) / 2 - 2; // 稍微内缩，留出边缘

        // 清除画布
        ctx.clearRect(0, 0, width, height);

        // 绘制背景色（用于留白）
        ctx.fillStyle = '#f0f0f0'; // 浅灰色背景，与UI协调
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();

        // 绘制60个扇形色块
        for (let i = 0; i < this.totalSegments; i++) {
          const startAngle = (i * this.segmentDegrees) * Math.PI / 180;
          const endAngle = (i * this.segmentDegrees + this.fillDegrees) * Math.PI / 180;

          // 计算当前扇形的色相（取扇形的中间角度）
          const hueAngle = i * this.segmentDegrees + this.fillDegrees / 2;
          // 固定饱和度100%，亮度50%以便显示纯色
          const rgb = this.hslToRgb(hueAngle, 100, 50);
          ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.arc(centerX, centerY, radius, startAngle, endAngle);
          ctx.closePath();
          ctx.fill();
        }

        // 绘制中心小圆（可选，用于放置预览点）
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
        const radius = canvas.width / 2 - 2;

        // 计算指示器位置（位于当前色相角度的外边缘）
        const rad = (this.hue - 90) * Math.PI / 180; // 调整角度起点为顶部
        const x = centerX + Math.cos(rad) * (radius - 8);
        const y = centerY + Math.sin(rad) * (radius - 8);

        // 绘制外圈
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
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
          let angle = Math.atan2(dy, dx) * 180 / Math.PI;
          if (angle < 0) angle += 360;
          // 将角度对齐到最近的色块中心
          const segmentIndex = Math.floor(angle / this.segmentDegrees);
          const segmentCenter = segmentIndex * this.segmentDegrees + this.fillDegrees / 2;
          this.hue = segmentCenter;
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
