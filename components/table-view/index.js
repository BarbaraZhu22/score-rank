// components/table-view/index.js
// Simplified table view component for WeChat Mini Program
const { db } = require('../../utils/db');
const { applyActions } = require('../../utils/actions');

Component({
  properties: {
    matchId: {
      type: [Number, String],
      value: null
    },
    judges: {
      type: Array,
      value: []
    },
    contestants: {
      type: Array,
      value: []
    },
    scores: {
      type: Array,
      value: []
    },
    contestantNumbers: {
      type: Object,
      value: {}
    },
    matchName: {
      type: String,
      value: ''
    }
  },

  data: {
    editingCell: null,
    editValue: '',
    showOperations: false,
    scoreMap: {},
    totalMap: {}
  },

  observers: {
    'scores,contestants,judges': function() {
      this.updateScoreMap();
    }
  },

  lifetimes: {
    attached() {
      this.updateScoreMap();
    }
  },

  methods: {
    updateScoreMap() {
      const { scores, contestants, judges } = this.properties;
      const scoreMap = {};
      const totalMap = {};
      
      scores.forEach(score => {
        const key = `${score.contestant}|${score.judge}`;
        scoreMap[key] = score.value;
      });
      
      contestants.forEach(contestant => {
        let total = 0;
        let count = 0;
        judges.forEach(judge => {
          const key = `${contestant}|${judge}`;
          const value = scoreMap[key];
          if (value !== null && value !== undefined && !isNaN(value) && isFinite(value)) {
            total += value;
            count++;
          }
        });
        totalMap[contestant] = count > 0 ? total : 0;
      });
      
      this.setData({ scoreMap, totalMap });
    },

    handleCellDoubleClick(e) {
      const { contestant, judge } = e.currentTarget.dataset;
      const score = this.getScore(contestant, judge);
      this.setData({
        editingCell: { contestant, judge },
        editValue: score !== null ? score.toString() : ''
      });
    },

    onEditValueInput(e) {
      this.setData({ editValue: e.detail.value });
    },

    async handleCellBlur() {
      const { editingCell, editValue, matchId } = this.data;
      if (!editingCell) return;

      // Check if user is admin (only admin can edit)
      const { getUserId } = require('../../utils/db');
      try {
        const userId = await getUserId();
        const isAdmin = await db.roles.isAdmin(userId);
        if (!isAdmin) {
          wx.showToast({
            title: '只有管理员可以编辑',
            icon: 'none'
          });
          this.setData({ editingCell: null });
          return;
        }
      } catch (e) {
        console.error('Failed to check admin status:', e);
      }

      try {
        const numValue = editValue.trim() === '' ? null : parseFloat(editValue);

        if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 100)) {
          wx.showToast({
            title: '请输入有效的分数 (0-100)',
            icon: 'none'
          });
          this.setData({ editingCell: null });
          return;
        }

        const match = await db.matches.get(matchId);
        if (!match) {
          throw new Error('Match not found');
        }

        // Get current version from parent
        const currentVersion = match.version || 1;
        const scores = [...(match.scores || [])];
        const now = Date.now();
        
        // Find existing score
        const scoreIndex = scores.findIndex(
          s => s.contestant === editingCell.contestant && s.judge === editingCell.judge
        );

        if (scoreIndex !== -1) {
          // Update existing score
          scores[scoreIndex] = {
            contestant: editingCell.contestant,
            judge: editingCell.judge,
            value: numValue,
            updatedAt: now,
          };
        } else {
          // Add new score
          scores.push({
            contestant: editingCell.contestant,
            judge: editingCell.judge,
            value: numValue,
            updatedAt: now,
          });
        }

        // Update match with version check
        const updateResult = await db.matches.update(match.id, { scores }, currentVersion);
        
        if (!updateResult.success) {
          if (updateResult.error === 'VERSION_CONFLICT') {
            wx.showModal({
              title: '数据冲突',
              content: '检测到数据已被其他用户更新，请先刷新后再操作',
              showCancel: true,
              confirmText: '刷新',
              cancelText: '取消',
              success: (res) => {
                if (res.confirm) {
                  this.triggerEvent('refresh');
                }
              }
            });
            this.setData({ editingCell: null });
            return;
          }
          throw new Error(updateResult.error || 'Update failed');
        }

        this.setData({ editingCell: null });
        
        // Update properties with new scores
        this.properties.scores = updateResult.match.scores || [];
        this.updateScoreMap();
        this.triggerEvent('update');
      } catch (error) {
        console.error('Error saving cell:', error);
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        });
        this.setData({ editingCell: null });
      }
    },

    getScore(contestant, judge) {
      const { scoreMap } = this.data;
      const key = `${contestant}|${judge}`;
      return scoreMap[key] !== undefined ? scoreMap[key] : null;
    },

    calculateTotal(contestant) {
      const { totalMap } = this.data;
      return totalMap[contestant] || 0;
    },

    toggleOperations() {
      this.setData({ showOperations: !this.data.showOperations });
    },

    async handleExportExcel() {
      wx.showToast({
        title: '导出功能开发中',
        icon: 'none'
      });
    },

    async handleDeleteContestant(e) {
      // Check if user is admin
      const { getUserId } = require('../../utils/db');
      try {
        const userId = await getUserId();
        const isAdmin = await db.roles.isAdmin(userId);
        if (!isAdmin) {
          wx.showToast({
            title: '只有管理员可以删除选手',
            icon: 'none'
          });
          return;
        }
      } catch (e) {
        console.error('Failed to check admin status:', e);
        return;
      }

      const contestant = e.currentTarget.dataset.contestant;
      const { matchId } = this.properties;
      
      wx.showModal({
        title: '确认删除',
        content: `确定要删除选手 "${contestant}" 吗？这将删除该选手的所有评分数据。`,
        success: async (res) => {
          if (res.confirm) {
            try {
              const match = await db.matches.get(matchId);
              await applyActions(matchId, [
                { type: 'removeContestant', name: contestant }
              ], match.version);
              this.triggerEvent('update');
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
            } catch (error) {
              console.error('Error deleting contestant:', error);
              if (error.message === 'VERSION_CONFLICT') {
                wx.showModal({
                  title: '数据冲突',
                  content: '检测到数据已被其他用户更新，请先刷新后再操作',
                  showCancel: true,
                  confirmText: '刷新',
                  cancelText: '取消',
                  success: (refreshRes) => {
                    if (refreshRes.confirm) {
                      this.triggerEvent('refresh');
                    }
                  }
                });
              } else {
                wx.showToast({
                  title: '删除失败，请重试',
                  icon: 'none'
                });
              }
            }
          }
        }
      });
    }
  }
});

