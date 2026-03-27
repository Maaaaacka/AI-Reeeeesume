(function() {
  class ProgressBar {
    constructor(options = {}) {
      this.options = {
        container: null,
        autoClose: true,
        closeDelay: 500,
        ...options
      };
      this.progress = 0;
      this.isActive = false;
      this.fastInterval = null;
      this.slowInterval = null;
      this.element = null;
      this.fillElement = null;
      this.textElement = null;
    }

    create() {
      if (this.element) return this.element;
      
      const div = document.createElement('div');
      div.className = 'progress-generate';
      div.innerHTML = `
        <div class="progress-generate-bar">
          <div class="progress-generate-fill" style="width: 0%"></div>
        </div>
        <div class="progress-generate-text">准备就绪</div>
      `;
      
      this.element = div;
      this.fillElement = div.querySelector('.progress-generate-fill');
      this.textElement = div.querySelector('.progress-generate-text');
      
      return this.element;
    }

    updateProgress(percent, text) {
      this.progress = Math.min(100, Math.max(0, percent));
      if (this.fillElement) {
        this.fillElement.style.width = this.progress + '%';
      }
      if (text && this.textElement) {
        this.textElement.textContent = text;
      } else if (this.textElement) {
        this.textElement.textContent = `生成中 ${Math.floor(this.progress)}%`;
      }
    }

    start(text = '准备就绪') {
      if (this.isActive) return;
      
      this.isActive = true;
      this.progress = 0;
      this.updateProgress(0, text);
      
      if (this.fastInterval) clearInterval(this.fastInterval);
      if (this.slowInterval) clearInterval(this.slowInterval);
      
      let step = 0;
      this.fastInterval = setInterval(() => {
        if (this.progress < 90) {
          let increment;
          if (step < 30) {
            increment = 3;
          } else if (step < 60) {
            increment = 2;
          } else {
            increment = 1;
          }
          let newProgress = this.progress + increment;
          if (newProgress > 90) newProgress = 90;
          this.updateProgress(newProgress);
          step++;
        }
        
        if (this.progress >= 90) {
          if (this.fastInterval) {
            clearInterval(this.fastInterval);
            this.fastInterval = null;
          }
          
          if (!this.slowInterval) {
            this.slowInterval = setInterval(() => {
              if (this.progress < 99) {
                let newProgress = this.progress + 1;
                if (newProgress > 99) newProgress = 99;
                this.updateProgress(newProgress);
              }
            }, 1000);
          }
        }
      }, 200);
    }

    finish(text = '完成') {
      if (!this.isActive) return;
      
      if (this.fastInterval) {
        clearInterval(this.fastInterval);
        this.fastInterval = null;
      }
      if (this.slowInterval) {
        clearInterval(this.slowInterval);
        this.slowInterval = null;
      }
      
      this.updateProgress(100, text);
      this.isActive = false;
      
      if (this.options.autoClose) {
        setTimeout(() => {
          this.hide();
        }, this.options.closeDelay);
      }
    }

    fail(text = '生成失败') {
      if (!this.isActive) return;
      
      if (this.fastInterval) {
        clearInterval(this.fastInterval);
        this.fastInterval = null;
      }
      if (this.slowInterval) {
        clearInterval(this.slowInterval);
        this.slowInterval = null;
      }
      
      this.updateProgress(this.progress, text);
      this.isActive = false;
      
      if (this.element) {
        this.element.classList.add('progress-generate-error');
        setTimeout(() => {
          this.element.classList.remove('progress-generate-error');
        }, 1000);
      }
      
      if (this.options.autoClose) {
        setTimeout(() => {
          this.hide();
        }, 1500);
      }
    }

    show(container) {
      const targetContainer = container || this.options.container;
      if (!targetContainer) return;
      
      const progressElement = this.create();
      if (!progressElement.parentNode || progressElement.parentNode !== targetContainer) {
        targetContainer.appendChild(progressElement);
      }
      progressElement.style.display = 'block';
    }

    hide() {
      if (this.element) {
        this.element.style.display = 'none';
      }
      this.progress = 0;
      this.isActive = false;
      if (this.fastInterval) {
        clearInterval(this.fastInterval);
        this.fastInterval = null;
      }
      if (this.slowInterval) {
        clearInterval(this.slowInterval);
        this.slowInterval = null;
      }
    }

    reset() {
      this.progress = 0;
      this.isActive = false;
      if (this.fastInterval) {
        clearInterval(this.fastInterval);
        this.fastInterval = null;
      }
      if (this.slowInterval) {
        clearInterval(this.slowInterval);
        this.slowInterval = null;
      }
      if (this.fillElement) {
        this.fillElement.style.width = '0%';
      }
      if (this.textElement) {
        this.textElement.textContent = '准备就绪';
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.ProgressBar = ProgressBar;
  }
})();
