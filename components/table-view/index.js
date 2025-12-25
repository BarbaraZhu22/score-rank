// components/table-view/index.js
const { db } = require("../../utils/db");
const { applyActions } = require("../../utils/actions");

Component({
  properties: {
    matchId: {
      type: [Number, String],
      value: null,
    },
    judges: {
      type: Array,
      value: [],
    },
    contestants: {
      type: Array,
      value: [],
    },
    scores: {
      type: Array,
      value: [],
    },
    contestantNumbers: {
      type: Object,
      value: {},
    },
    matchName: {
      type: String,
      value: "",
    },
    currentVersion: {
      type: Number,
      value: null,
    },
    tableData: {
      type: Array,
      value: [], // 父组件计算好的表格数据 [{updatedAt, contestant, judge1:xx, judge2:xx, total}]
    },
  },

  data: {
    showOperations: false,
    showRank: false,
    showCellModal: false,
    isAddMode: false,
    selectedCell: null,
    currentContestantList: [], // 当前显示的列表（根据showRank排序）
    tempScores: {},
    realTimeTotal: "0.00",
    newContestantNumber: "",
    canvasWidth: 750,
    canvasHeight: 1000,
    isSaving: false, // 防止重复保存
  },

  // 【修复1：监听tableData变化，自动更新显示列表，并计算排名和格式化数据】
  observers: {
    "tableData,showRank,contestantNumbers": function (tableData, showRank, contestantNumbers) {
      if (!Array.isArray(tableData) || tableData.length === 0) {
        this.setData({ currentContestantList: [] });
        return;
      }
      
      // 根据showRank决定显示排序后的列表，并计算排名和格式化数据
      let sortedList;
      if (showRank) {
        sortedList = [...tableData].sort((a, b) => {
          const totalA = a.total || 0;
          const totalB = b.total || 0;
          return totalB - totalA;
        });
      } else {
        sortedList = [...tableData].sort((a, b) => {
          const numA = parseInt(contestantNumbers[a.contestant] || "0") || 0;
          const numB = parseInt(contestantNumbers[b.contestant] || "0") || 0;
          return numA - numB;
        });
      }
      
      // 为每个item添加排名、格式化数据、唯一key
      const processedList = sortedList.map((item, index) => {
        const processed = { ...item };
        // 添加唯一key
        processed._key = `${item.contestant}_${item.updatedAt}_${index}`;
        // 添加排名
        if (showRank) {
          processed.rank = index + 1;
          // 添加排名class
          if (processed.rank === 1) processed.rankClass = "rank-1";
          else if (processed.rank === 2) processed.rankClass = "rank-2";
          else if (processed.rank === 3) processed.rankClass = "rank-3";
          else if (processed.rank <= 10) processed.rankClass = "rank-top10";
          else processed.rankClass = "";
        } else {
          processed.rank = "";
          processed.rankClass = "";
        }
        // 格式化每个judge的分数
        const { judges } = this.properties;
        processed.formattedScores = {};
        judges.forEach((judge) => {
          const score = item[judge];
          processed.formattedScores[judge] =
            score != null && !isNaN(score) ? score.toFixed(2) : "-";
          // 添加cell class
          const isEmpty = score == null || isNaN(score);
          processed.formattedScores[`${judge}_class`] = `editable ${isEmpty ? "empty" : ""}`;
        });
        // 格式化总分
        processed.formattedTotal = (item.total || 0).toFixed(2);
        return processed;
      });
      
      this.setData({ currentContestantList: processedList });
    },
    tempScores: function (tempScores) {
      this.calculateRealTimeTotal(tempScores);
    },
    matchId: function (matchId) {
      if (matchId) console.info("Table view matchId updated:", matchId);
    },
  },

  lifetimes: {
    ready() {
      if (!this.properties.matchId)
        console.warn("Table view: matchId is missing!");
    },
  },

  methods: {

    // 【增量更新：立即更新UI，后台异步同步到数据库】
    async handleModalSave() {
      // 防止重复保存
      if (this.data.isSaving) {
        return;
      }

      const { isAddMode, newContestantNumber, tempScores, selectedCell } =
        this.data;
      const { matchId, judges } = this.properties;

      if (!matchId) {
        wx.showToast({ title: "比赛ID异常，请重试", icon: "none" });
        return;
      }

      this.setData({ isSaving: true });

      // 1. 先关闭弹窗，提升用户体验
      this.handleCellModalClose();

      // 2. 管理员校验
      const { getUserId } = require("../../utils/db");
      try {
        const userId = await getUserId();
        const isAdmin = await db.roles.isAdmin(userId);
        if (!isAdmin) {
          this.setData({ isSaving: false });
          wx.showToast({ title: "只有管理员可以操作", icon: "none" });
          return;
        }
      } catch (e) {
        console.error("权限校验失败:", e);
        this.setData({ isSaving: false });
        wx.showToast({ title: "权限校验失败", icon: "none" });
        return;
      }

      try {
        const now = Date.now();
        let incrementalScores = [];
        let incrementalContestants = [];
        let incrementalContestantNumbers = {};

        if (isAddMode) {
          // 添加选手逻辑
          const newContestantId = `contestant_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 8)}`;
          
          // 构建新分数数组
          judges.forEach((judge) => {
            const numValue =
              tempScores[judge]?.trim() === ""
                ? null
                : parseFloat(tempScores[judge]) || null;
            if (numValue !== null) {
              incrementalScores.push({
                contestant: newContestantId,
                judge,
                value: numValue,
                updatedAt: now,
              });
            }
          });
          
          incrementalContestants = [newContestantId];
          incrementalContestantNumbers = { [newContestantId]: newContestantNumber };
        } else {
          // 编辑选手逻辑
          const contestant = selectedCell?.contestant;
          if (!contestant) throw new Error("选手信息异常");
          
          // 构建更新的分数数组（先删除该选手的所有分数，再添加新分数）
          judges.forEach((judge) => {
            const numValue =
              tempScores[judge]?.trim() === ""
                ? null
                : parseFloat(tempScores[judge]) || null;
            if (numValue !== null) {
              incrementalScores.push({
                contestant,
                judge,
                value: numValue,
                updatedAt: now,
              });
            }
          });
        }

        // 3. 触发增量更新事件（立即更新UI，后台异步同步）
        this.triggerEvent("incremental", {
          scores: incrementalScores,
          contestants: incrementalContestants,
          contestantNumbers: incrementalContestantNumbers,
          // 编辑时不需要删除，直接用增量覆盖
        });

        this.setData({ isSaving: false });
      } catch (error) {
        // 错误处理
        console.error(isAddMode ? "添加失败:" : "保存失败:", error);
        this.setData({ isSaving: false });
        wx.showToast({
          title: isAddMode ? "添加失败，请重试" : "保存失败，请重试",
          icon: "none",
        });
      }
    },

    // 直接从tableData中读取数据
    getRank(row) {
      if (!this.data.showRank || !row) return "";
      const { currentContestantList } = this.data;
      const index = currentContestantList.findIndex(
        (r) => r.contestant === row.contestant && r.updatedAt === row.updatedAt
      );
      return index !== -1 ? index + 1 : "";
    },

    getRankClass(row) {
      if (!this.data.showRank || !row) return "";
      const rank = this.getRank(row);
      if (rank === 1) return "rank-1";
      if (rank === 2) return "rank-2";
      if (rank === 3) return "rank-3";
      if (rank <= 10) return "rank-top10";
      return "";
    },

    getScoreText(row, judge) {
      if (!row || !judge) return "-";
      const score = row[judge];
      return score != null && !isNaN(score) ? score.toFixed(2) : "-";
    },

    getTotalText(row) {
      if (!row) return "0.00";
      const total = row.total || 0;
      return total.toFixed(2);
    },

    getCellClass(row, judge) {
      if (!row || !judge) return "editable empty";
      const score = row[judge];
      const isEmpty = score == null || isNaN(score);
      return `editable ${isEmpty ? "empty" : ""}`;
    },

    handleCellDoubleClick(e) {
      const { contestant, judge } = e.currentTarget.dataset;
      if (!contestant || !judge) return;

      // 从tableData中找到对应的row
      const { tableData } = this.properties;
      const row = tableData.find((r) => r.contestant === contestant);
      if (!row) return;

      const tempScores = {};
      this.properties.judges.forEach((j) => {
        const score = row[j];
        tempScores[j] =
          score !== null && !isNaN(score) ? score.toString() : "";
      });

      this.setData({
        showCellModal: true,
        isAddMode: false,
        selectedCell: { contestant },
        tempScores,
      });
    },

    generateNewContestantNumber() {
      const { contestantNumbers } = this.properties;
      const numberList = Object.values(contestantNumbers || {}).map(
        (num) => parseInt(num) || 0
      );
      const maxNumber = numberList.length > 0 ? Math.max(...numberList) : 0;
      return (maxNumber + 1).toString();
    },

    handleAddContestant() {
      const tempScores = {};
      this.properties.judges.forEach((j) => {
        tempScores[j] = "";
      });

      const newNumber = this.generateNewContestantNumber();

      this.setData({
        showCellModal: true,
        isAddMode: true,
        selectedCell: null,
        tempScores,
        realTimeTotal: "0.00",
        newContestantNumber: newNumber,
      });
    },

    onScoreInput(e) {
      const { judge } = e.currentTarget.dataset;
      const { value } = e.detail;
      const { tempScores } = this.data;
      tempScores[judge] = value.trim();
      this.setData({ tempScores });
    },

    calculateRealTimeTotal(tempScores) {
      let total = 0;
      Object.values(tempScores || {}).forEach((val) => {
        const num = parseFloat(val);
        if (!isNaN(num) && isFinite(num)) {
          total += num;
        }
      });
      this.setData({
        realTimeTotal: total.toFixed(2),
      });
    },

    handleCellModalClose() {
      this.setData({
        showCellModal: false,
        isAddMode: false,
        selectedCell: null,
        tempScores: {},
        realTimeTotal: "0.00",
        newContestantNumber: "",
      });
    },

    toggleOperations() {
      this.setData({ showOperations: !this.data.showOperations });
    },

    toggleRank() {
      this.setData({ showRank: !this.data.showRank });
      // observer会自动处理排序
    },

    async handleExportImage() {
      const { currentContestantList, showRank } = this.data;
      const { judges, contestantNumbers, matchName } = this.properties;

      if (!currentContestantList || currentContestantList.length === 0) {
        wx.showToast({ title: "暂无数据可导出", icon: "none" });
        return;
      }

      wx.showLoading({ title: "正在生成图片..." });

      try {
        // 1. 获取 canvas 节点
        const query = wx.createSelectorQuery().in(this);
        const canvasNode = await new Promise((resolve, reject) => {
          query
            .select("#exportCanvas")
            .fields({ node: true, size: true })
            .exec((res) => {
              if (res && res[0] && res[0].node) {
                resolve(res[0].node);
              } else {
                reject(new Error("Canvas 节点获取失败"));
              }
            });
        });

        // 2. 创建 canvas 2D 上下文
        const ctx = canvasNode.getContext("2d");
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const canvasWidth = 750;
        const canvasHeight = Math.max(1000, 200 + currentContestantList.length * 50);

        // 设置 canvas 实际尺寸
        canvasNode.width = canvasWidth * dpr;
        canvasNode.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);

        // 3. 绘制背景
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 4. 绘制标题
        ctx.fillStyle = "#333333";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const title = matchName || "评分表";
        ctx.fillText(title, canvasWidth / 2, 40);

        // 5. 计算列宽
        const padding = 20;
        const startY = 80;
        const rowHeight = 50;
        const headerHeight = 50;

        // 计算各列宽度
        const rankColWidth = showRank ? 60 : 0;
        const firstColWidth = 80;
        const totalColWidth = 80;
        const availableWidth = canvasWidth - padding * 2 - rankColWidth - firstColWidth - totalColWidth;
        const judgeColWidth = judges.length > 0 ? availableWidth / judges.length : 0;

        let currentX = padding;

        // 6. 绘制表头
        ctx.fillStyle = "#374c62";
        ctx.fillRect(padding, startY, canvasWidth - padding * 2, headerHeight);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (showRank) {
          ctx.fillText("排名", currentX + rankColWidth / 2, startY + headerHeight / 2);
          currentX += rankColWidth;
        }

        ctx.fillText("海选号", currentX + firstColWidth / 2, startY + headerHeight / 2);
        currentX += firstColWidth;

        judges.forEach((judge) => {
          ctx.fillText(judge, currentX + judgeColWidth / 2, startY + headerHeight / 2);
          currentX += judgeColWidth;
        });

        ctx.fillText("总分", currentX + totalColWidth / 2, startY + headerHeight / 2);

        // 7. 绘制表格内容
        ctx.font = "24px sans-serif";
        ctx.fillStyle = "#333333";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        currentContestantList.forEach((item, index) => {
          const rowY = startY + headerHeight + index * rowHeight;
          currentX = padding;

          // 确保每行开始时重置样式
          ctx.fillStyle = "#333333";
          ctx.font = "24px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // 行背景色（偶数行）
          if (index % 2 === 1) {
            ctx.fillStyle = "#fff9e6";
            ctx.fillRect(padding, rowY, canvasWidth - padding * 2, rowHeight);
            ctx.fillStyle = "#333333"; // 恢复文字颜色
          }

          // 排名列（绘制紫色圆圈和排名数字）
          if (showRank) {
            const rankCenterX = currentX + rankColWidth / 2;
            const rankCenterY = rowY + rowHeight / 2;
            const circleRadius = 22; // 圆圈半径
            
            // 绘制紫色圆圈背景
            ctx.fillStyle = "#e6e6ff";
            ctx.beginPath();
            ctx.arc(rankCenterX, rankCenterY, circleRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // 绘制排名数字（紫色文字）
            ctx.fillStyle = "#6666cc";
            ctx.font = "bold 24px sans-serif";
            const rankText = item.rank ? String(item.rank) : "";
            ctx.fillText(rankText, rankCenterX, rankCenterY);
            
            // 恢复字体和颜色
            ctx.font = "24px sans-serif";
            ctx.fillStyle = "#333333";
            currentX += rankColWidth;
          }

          // 海选号
          const contestantNumber = (contestantNumbers && contestantNumbers[item.contestant]) || "-";
          ctx.fillText(
            String(contestantNumber),
            currentX + firstColWidth / 2,
            rowY + rowHeight / 2
          );
          currentX += firstColWidth;

          // 裁判分数
          if (judges && Array.isArray(judges) && judges.length > 0) {
            judges.forEach((judge) => {
              // 确保 formattedScores 存在，如果不存在则从 item 中获取原始分数
              let score = "-";
              if (item.formattedScores && item.formattedScores[judge] !== undefined) {
                score = item.formattedScores[judge];
              } else if (item[judge] !== undefined && item[judge] !== null) {
                score = typeof item[judge] === 'number' ? item[judge].toFixed(2) : String(item[judge]);
              }
              ctx.fillText(String(score), currentX + judgeColWidth / 2, rowY + rowHeight / 2);
              currentX += judgeColWidth;
            });
          }

          // 总分
          const totalText = item.formattedTotal || "0.00";
          ctx.fillText(
            String(totalText),
            currentX + totalColWidth / 2,
            rowY + rowHeight / 2
          );
        });

        // 8. 绘制边框
        ctx.strokeStyle = "#e0e0e0";
        ctx.lineWidth = 1;
        ctx.strokeRect(padding, startY, canvasWidth - padding * 2, headerHeight + currentContestantList.length * rowHeight);

        // 绘制行分隔线
        for (let i = 0; i <= currentContestantList.length; i++) {
          const y = startY + headerHeight + i * rowHeight;
          ctx.beginPath();
          ctx.moveTo(padding, y);
          ctx.lineTo(canvasWidth - padding, y);
          ctx.stroke();
        }

        // 9. 导出图片
        await new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas: canvasNode,
            width: canvasWidth,
            height: canvasHeight,
            destWidth: canvasWidth * dpr,
            destHeight: canvasHeight * dpr,
            success: async (res) => {
              try {
                // 10. 保存到相册
                await new Promise((resolveSave, rejectSave) => {
                  wx.saveImageToPhotosAlbum({
                    filePath: res.tempFilePath,
                    success: () => {
                      resolveSave();
                    },
                    fail: (err) => {
                      if (err.errMsg.includes("auth deny") || err.errMsg.includes("authorize")) {
                        // 用户拒绝授权，引导用户开启
                        wx.showModal({
                          title: "需要授权",
                          content: "需要您授权保存图片到相册",
                          confirmText: "去设置",
                          success: (modalRes) => {
                            if (modalRes.confirm) {
                              wx.openSetting({
                                success: (settingRes) => {
                                  if (settingRes.authSetting["scope.writePhotosAlbum"]) {
                                    wx.showToast({ title: "请重新点击导出", icon: "none" });
                                  }
                                },
                              });
                            }
                          },
                        });
                      }
                      rejectSave(err);
                    },
                  });
                });
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            fail: (err) => {
              console.error("canvasToTempFilePath 失败:", err);
              reject(err);
            },
          });
        });

        wx.hideLoading();
        wx.showToast({ title: "图片已保存到相册", icon: "success" });
      } catch (error) {
        console.error("导出图片失败:", error);
        wx.hideLoading();
        wx.showToast({ title: "导出失败，请重试", icon: "none" });
      }
    },

    async handleDeleteContestant(e) {
      const contestant = e.currentTarget.dataset.contestant;
      const { matchId, currentVersion } = this.properties;
      if (!contestant || !matchId) {
        wx.showToast({ title: "数据异常，请重试", icon: "none" });
        return;
      }

      const { getUserId } = require("../../utils/db");
      try {
        const userId = await getUserId();
        const isAdmin = await db.roles.isAdmin(userId);
        if (!isAdmin) {
          wx.showToast({ title: "只有管理员可以删除", icon: "none" });
          return;
        }
      } catch (e) {
        console.error("权限校验失败:", e);
        wx.showToast({ title: "权限校验失败", icon: "none" });
        return;
      }

      wx.showModal({
        title: "确认删除",
        content: `确定删除选手 "${contestant}"？`,
        success: async (res) => {
          if (res.confirm) {
            try {
              // 1. 先拉取数据库最新数据
              let match = await db.matches.get(matchId);
              if (!match) throw new Error("比赛不存在");

              const dbVersion = match.version || 1;
              const localVersion = currentVersion || dbVersion;

              // 2. 如果数据库版本号高于当前版本，自动合并
              if (dbVersion > localVersion) {
                const currentData = {
                  scores: this.properties.scores || [],
                  contestants: this.properties.contestants || [],
                  contestantNumbers: this.properties.contestantNumbers || {},
                };
                const mergeResult = await db.matches.mergeMatchData(matchId, currentData, match);
                if (mergeResult.success) {
                  match = mergeResult.match;
                }
              }

              // 3. 执行删除操作
              const updatedContestants = (match.contestants || []).filter((c) => c !== contestant);
              const updatedScores = (match.scores || []).filter(
                (s) => s.contestant !== contestant
              );
              const updatedNumbers = { ...(match.contestantNumbers || {}) };
              delete updatedNumbers[contestant];

              const updateResult = await db.matches.update(
                matchId,
                {
                  contestants: updatedContestants,
                  scores: updatedScores,
                  contestantNumbers: updatedNumbers,
                },
                match.version
              );

              // 4. 如果还有版本冲突，再次合并
              if (!updateResult.success && updateResult.error === "VERSION_CONFLICT") {
                const latestMatch = await db.matches.get(matchId);
                const currentData = {
                  scores: updatedScores,
                  contestants: updatedContestants,
                  contestantNumbers: updatedNumbers,
                };
                const mergeResult = await db.matches.mergeMatchData(matchId, currentData, latestMatch);
                if (mergeResult.success) {
                  match = mergeResult.match;
                } else {
                  throw new Error("合并失败");
                }
              } else if (!updateResult.success) {
                throw new Error(updateResult.error || "更新失败");
              } else {
                match = updateResult.match;
              }

              // 5. 通知父页面刷新（父页面会重新计算tableData）
              this.triggerEvent("update");
              wx.showToast({ title: "删除成功", icon: "success" });
            } catch (error) {
              console.error("删除失败:", error);
              wx.showToast({ title: "删除失败，请重试", icon: "none" });
            }
          }
        },
      });
    },

    stopPropagation() {},
  },
});
