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
      if (matchId) console.log("Table view matchId updated:", matchId);
    },
  },

  lifetimes: {
    ready() {
      if (!this.properties.matchId)
        console.warn("Table view: matchId is missing!");
    },
  },

  methods: {

    // 【修复4：handleModalSave中，保存成功后强制更新组件内数据，并处理版本冲突自动合并】
    async handleModalSave() {
      const { isAddMode, newContestantNumber, tempScores, selectedCell } =
        this.data;
      const { matchId, judges, contestants, contestantNumbers, scores: currentScores } =
        this.properties;

      if (!matchId) {
        wx.showToast({ title: "比赛ID异常，请重试", icon: "none" });
        return;
      }

      // 管理员校验（原有逻辑保留）
      const { getUserId } = require("../../utils/db");
      try {
        const userId = await getUserId();
        const isAdmin = await db.roles.isAdmin(userId);
        if (!isAdmin) {
          wx.showToast({ title: "只有管理员可以操作", icon: "none" });
          this.handleCellModalClose();
          return;
        }
      } catch (e) {
        console.error("权限校验失败:", e);
        wx.showToast({ title: "权限校验失败", icon: "none" });
        return;
      }

      try {
        // 1. 先拉取数据库最新数据
        let match = await db.matches.get(matchId);
        if (!match) throw new Error("比赛不存在");

        const currentVersion = this.properties.currentVersion || match.version || 1;
        const dbVersion = match.version || 1;
        let scores = [...(match.scores || [])];
        const now = Date.now();

        // 2. 如果数据库版本号高于当前版本，自动合并
        if (dbVersion > currentVersion) {
          console.log("检测到版本冲突，自动合并数据...");
          const currentData = {
            scores: currentScores || [],
            contestants: contestants || [],
            contestantNumbers: contestantNumbers || {},
          };
          const mergeResult = await db.matches.mergeMatchData(matchId, currentData, match);
          if (mergeResult.success) {
            match = mergeResult.match;
            scores = [...(match.scores || [])];
          }
        }

        // 3. 执行当前操作（添加或编辑选手）
        if (isAddMode) {
          // 添加选手逻辑
          const newContestantId = `contestant_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 8)}`;
          judges.forEach((judge) => {
            const numValue =
              tempScores[judge]?.trim() === ""
                ? null
                : parseFloat(tempScores[judge]) || null;
            if (numValue !== null) {
              scores.push({
                contestant: newContestantId,
                judge,
                value: numValue,
                updatedAt: now,
              });
            }
          });
          // 提交更新
          const updateResult = await db.matches.update(
            matchId,
            {
              scores,
              contestants: [...(match.contestants || []), newContestantId],
              contestantNumbers: {
                ...(match.contestantNumbers || {}),
                [newContestantId]: newContestantNumber,
              },
            },
            match.version
          );
          if (!updateResult.success && updateResult.error === "VERSION_CONFLICT") {
            // 如果还有版本冲突，再次合并并重试
            const latestMatch = await db.matches.get(matchId);
            const currentData = {
              scores: scores,
              contestants: [...(match.contestants || []), newContestantId],
              contestantNumbers: {
                ...(match.contestantNumbers || {}),
                [newContestantId]: newContestantNumber,
              },
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
        } else {
          // 编辑选手逻辑
          const contestant = selectedCell?.contestant;
          if (!contestant) throw new Error("选手信息异常");
          judges.forEach((judge) => {
            const numValue =
              tempScores[judge]?.trim() === ""
                ? null
                : parseFloat(tempScores[judge]) || null;
            const scoreIndex = scores.findIndex(
              (s) => s?.contestant === contestant && s?.judge === judge
            );
            if (scoreIndex !== -1) {
              if (numValue !== null) {
                scores[scoreIndex] = {
                  contestant,
                  judge,
                  value: numValue,
                  updatedAt: now,
                };
              } else {
                scores.splice(scoreIndex, 1);
              }
            } else if (numValue !== null) {
              scores.push({
                contestant,
                judge,
                value: numValue,
                updatedAt: now,
              });
            }
          });
          const updateResult = await db.matches.update(matchId, { scores }, match.version);
          if (!updateResult.success && updateResult.error === "VERSION_CONFLICT") {
            // 如果还有版本冲突，再次合并并重试
            const latestMatch = await db.matches.get(matchId);
            const currentData = {
              scores: scores,
              contestants: match.contestants || [],
              contestantNumbers: match.contestantNumbers || {},
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
        }

        // 4. 保存成功后，重新拉取最新数据并更新界面
        const latestMatch = await db.matches.get(matchId);
        this.setData(
          {
            // 同步最新的scores、contestants到properties（触发observer更新）
            scores: latestMatch.scores || [],
            contestants: latestMatch.contestants || [],
          },
          () => {
            this.handleCellModalClose();
            this.triggerEvent("update"); // 通知父页面刷新
            wx.showToast({
              title: isAddMode ? "添加成功" : "保存成功",
              icon: "success",
            });
          }
        );
      } catch (error) {
        // 错误处理
        console.error(isAddMode ? "添加失败:" : "保存失败:", error);
        wx.showToast({
          title: isAddMode ? "添加失败，请重试" : "保存失败，请重试",
          icon: "none",
        });
        this.handleCellModalClose();
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

    handleExportExcel() {
      wx.showToast({ title: "导出功能开发中", icon: "none" });
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
                console.log("检测到版本冲突，自动合并数据...");
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
