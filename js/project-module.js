// 作品/项目编辑组件
(function() {
  const ProjectEditor = {
    name: 'ProjectEditor',
    props: {
      modelValue: { type: Array, default: () => [] }
    },
    emits: ['update:modelValue'],
    template: `
      <div class="project-editor">
        <!-- 卡片头部 -->
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 16px; font-weight: 600; color: var(--text);">作品/项目</h3>
          <button class="btn-small" @click="addProject" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>添加</span>
          </button>
        </div>

        <!-- 项目列表 -->
        <div v-for="(proj, idx) in projects" :key="idx" class="project-item">
          <div style="display: flex; gap: 12px; align-items: flex-start;">
            <!-- 左侧小图标 -->
            <div style="flex-shrink: 0; width: 32px; height: 32px; background: var(--primary); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
            </div>
            <!-- 右侧输入区域 -->
            <div style="flex: 1;">
              <input type="text" v-model="proj.name" placeholder="项目名称" class="project-input" />
              <input type="url" v-model="proj.url" placeholder="链接地址 (https://...)" class="project-input" style="margin-top: 8px;" />
              <textarea v-model="proj.description" placeholder="简短描述（可选）" rows="2" class="project-input" style="margin-top: 8px; resize: vertical;"></textarea>
            </div>
            <!-- 删除按钮 -->
            <button class="btn-icon" @click="removeProject(idx)" style="flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `,
    computed: {
      projects: {
        get() { return this.modelValue; },
        set(val) { this.$emit('update:modelValue', val); }
      }
    },
    methods: {
      addProject() {
        this.projects.push({ name: '', url: '', description: '' });
      },
      removeProject(index) {
        this.projects.splice(index, 1);
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.ProjectEditor = ProjectEditor;
  }
})();
