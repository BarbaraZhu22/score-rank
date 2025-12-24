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
  },

  data: {
    showOperations: false,
    showRank: false,
    showCellModal: false,
    isAddMode: false, // 是否为添加选手模式
    selectedCell: null,
    scoreMap: {},
    totalMap: {},
    sortedContestants: [], // 按总分排序的列表（响应式）
    numberSortedContestants: [], // 按海选号排序的列表（响应式，预计算）
    currentContestantList: [], // 当前显示的选手列表（响应式）
    tempScores: {},
    realTimeTotal: "0.00",
    newContestantNumber: "", // 新增选手的海选号（自动生成）
  },

  observers: {
    // 监听核心数据变化，更新两个预计算列表
    "scores,contestants,judges,contestantNumbers": function () {
      this.updateScoreMap();
      this.updateSortedContestants();
      this.updateNumberSortedContestants();
    },
    // 监听排名显示状态变化，切换当前显示的列表
    "showRank,sortedContestants,numberSortedContestants": function (
      showRank,
      sorted,
      numberSorted
    ) {
      this.setData({
        currentContestantList: showRank ? sorted : numberSorted,
      });
    },
    // 监听临时评分变化，实时更新总分
    tempScores: function (tempScores) {
      this.calculateRealTimeTotal(tempScores);
    },
    matchId: function (matchId) {
      if (matchId) console.log("Table view matchId updated:", matchId);
    },
  },

  lifetimes: {
    attached() {
      this.updateScoreMap();
      this.updateSortedContestants();
      this.updateNumberSortedContestants();
    },
    ready() {
      if (!this.properties.matchId)
        console.warn("Table view: matchId is missing!");
    },
  },

  methods: {
    // 更新评分映射表
    updateScoreMap() {
      const { scores, contestants, judges } = this.properties;
      const scoreMap = {};
      const totalMap = {};

      scores.forEach((score) => {
        if (!score?.contestant || !score?.judge) return;
        const key = `${score.contestant}|${score.judge}`;
        scoreMap[key] =
          score.value !== null && score.value !== undefined
            ? parseFloat(score.value) || null
            : null;
      });

      contestants.forEach((contestant) => {
        if (!contestant) return;
        let total = 0;
        let count = 0;
        judges.forEach((judge) => {
          if (!judge) return;
          const key = `${contestant}|${judge}`;
          const value = scoreMap[key];
          if (
            value !== null &&
            value !== undefined &&
            !isNaN(value) &&
            isFinite(value)
          ) {
            total += value;
            count++;
          }
        });
        totalMap[contestant] = count > 0 ? total : 0;
      });

      this.setData({ scoreMap, totalMap });
    },

    // 预计算：按总分从高到低排序的列表（响应式）
    updateSortedContestants() {
      const { contestants, totalMap } = this.data;
      const validContestants = contestants || [];
      const sorted = [...validContestants].sort((a, b) => {
        if (!a || !b) return 0;
        const totalA = totalMap[a] || 0;
        const totalB = totalMap[b] || 0;
        return totalB - totalA;
      });
      this.setData({ sortedContestants: sorted });
    },

    // 预计算：按海选号从低到高排序的列表（响应式，解决隐藏排名为空问题）
    updateNumberSortedContestants() {
      const { contestants, contestantNumbers } = this.properties;
      const validContestants = contestants || [];
      const numberSorted = [...validContestants].sort((a, b) => {
        if (!a || !b) return 0;
        const numA = parseInt(contestantNumbers[a] || "0") || 0;
        const numB = parseInt(contestantNumbers[b] || "0") || 0;
        return numA - numB;
      });
      this.setData({ numberSortedContestants: numberSorted });
    },

    // 获取排名
    getRank(contestant) {
      if (!this.data.showRank || !contestant) return "";
      const { sortedContestants } = this.data;
      const index = sortedContestants.indexOf(contestant);
      return index !== -1 ? index + 1 : "";
    },

    // 获取排名样式类
    getRankClass(contestant) {
      if (!this.data.showRank || !contestant) return "";
      const rank = this.getRank(contestant);
      if (rank === 1) return "rank-1";
      if (rank === 2) return "rank-2";
      if (rank === 3) return "rank-3";
      if (rank <= 10) return "rank-top10";
      return "";
    },

    // 获取单元格显示文本
    getScoreText(contestant, judge) {
      if (!contestant || !judge) return "-";
      const key = `${contestant}|${judge}`;
      const score = this.data.scoreMap[key];
      return score != null && !isNaN(score) ? score.toFixed(2) : "-";
    },

    // 获取总分显示文本
    getTotalText(contestant) {
      if (!contestant) return "0.00";
      const total = this.data.totalMap[contestant] || 0;
      return total.toFixed(2);
    },

    // 获取单元格class
    getCellClass(contestant, judge) {
      if (!contestant || !judge) return "editable empty";
      const key = `${contestant}|${judge}`;
      const isEmpty =
        this.data.scoreMap[key] == null || isNaN(this.data.scoreMap[key]);
      return `editable ${isEmpty ? "empty" : ""}`;
    },

    // 编辑选手：打开弹窗
    handleCellDoubleClick(e) {
      const { contestant, judge } = e.currentTarget.dataset;
      if (!contestant || !judge) return;

      // 初始化临时评分
      const tempScores = {};
      this.properties.judges.forEach((j) => {
        const key = `${contestant}|${j}`;
        tempScores[j] =
          this.data.scoreMap[key] !== null && !isNaN(this.data.scoreMap[key])
            ? this.data.scoreMap[key].toString()
            : "";
      });

      this.setData({
        showCellModal: true,
        isAddMode: false,
        selectedCell: { contestant },
        tempScores,
      });
    },

    // 生成最新海选号（规则：取现有最大海选号+1，无选手则为1）
    generateNewContestantNumber() {
      const { contestantNumbers } = this.properties;
      const numberList = Object.values(contestantNumbers || {}).map(
        (num) => parseInt(num) || 0
      );
      const maxNumber = numberList.length > 0 ? Math.max(...numberList) : 0;
      return (maxNumber + 1).toString();
    },

    // 添加选手：打开弹窗（自动生成海选号）
    handleAddContestant() {
      // 初始化临时评分为空
      const tempScores = {};
      this.properties.judges.forEach((j) => {
        tempScores[j] = "";
      });

      // 自动生成最新海选号
      const newNumber = this.generateNewContestantNumber();

      this.setData({
        showCellModal: true,
        isAddMode: true,
        selectedCell: null,
        tempScores,
        realTimeTotal: "0.00",
        newContestantNumber: newNumber, // 赋值自动生成的海选号
      });
    },

    // 评分输入
    onScoreInput(e) {
      const { judge } = e.currentTarget.dataset;
      const { value } = e.detail;
      const { tempScores } = this.data;
      tempScores[judge] = value.trim();
      this.setData({ tempScores });
    },

    // 实时计算总分
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

    // 关闭弹窗
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

    // 弹窗保存（兼容编辑/添加模式）
    async handleModalSave() {
      const { isAddMode, newContestantNumber, tempScores, selectedCell } =
        this.data;
      const { matchId, judges, contestants, contestantNumbers } =
        this.properties;

      // 通用校验
      if (!matchId) {
        wx.showToast({ title: "比赛ID异常，请重试", icon: "none" });
        return;
      }

      // 管理员校验
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
        const match = await db.matches.get(matchId);
        if (!match) throw new Error("比赛不存在");

        const currentVersion = match.version || 1;
        let scores = [...(match.scores || [])];
        const now = Date.now();

        if (isAddMode) {
          // 添加选手逻辑
          // 1. 生成唯一选手标识（可根据业务调整）
          const newContestantId = `contestant_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 8)}`;
          // 2. 添加选手评分
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
          // 3. 提交选手添加+评分更新（需根据你的db逻辑调整，此处为示例）
          await db.matches.update(
            matchId,
            {
              scores,
              contestants: [...(contestants || []), newContestantId],
              contestantNumbers: {
                ...(contestantNumbers || {}),
                [newContestantId]: newContestantNumber,
              },
            },
            currentVersion
          );
        } else {
          // 编辑选手逻辑
          const contestant = selectedCell?.contestant;
          if (!contestant) throw new Error("选手信息异常");
          // 更新所有裁判评分
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
          // 提交评分更新
          await db.matches.update(matchId, { scores }, currentVersion);
        }

        // 刷新数据
        this.handleCellModalClose();
        this.triggerEvent("update"); // 通知父页面刷新数据
        wx.showToast({
          title: isAddMode ? "添加成功" : "保存成功",
          icon: "success",
        });
      } catch (error) {
        console.error(isAddMode ? "添加失败:" : "保存失败:", error);
        if (error.message === "VERSION_CONFLICT") {
          wx.showModal({
            title: "数据冲突",
            content: "请刷新后再操作",
            confirmText: "刷新",
            success: (res) => res.confirm && this.triggerEvent("refresh"),
          });
        } else {
          wx.showToast({
            title: isAddMode ? "添加失败，请重试" : "保存失败，请重试",
            icon: "none",
          });
        }
        this.handleCellModalClose();
      }
    },

    // 切换操作列
    toggleOperations() {
      this.setData({ showOperations: !this.data.showOperations });
    },

    // 切换排名
    toggleRank() {
      this.setData({ showRank: !this.data.showRank });
    },

    // 导出Excel
    handleExportExcel() {
      wx.showToast({ title: "导出功能开发中", icon: "none" });
    },

    // 删除选手
    async handleDeleteContestant(e) {
      const contestant = e.currentTarget.dataset.contestant;
      const { matchId } = this.properties;
      if (!contestant || !matchId) {
        wx.showToast({ title: "数据异常，请重试", icon: "none" });
        return;
      }

      // 管理员校验
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
              const match = await db.matches.get(matchId);
              if (!match) throw new Error("比赛不存在");

              await applyActions(
                matchId,
                [{ type: "removeContestant", name: contestant }],
                match.version
              );

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

    // 阻止事件冒泡
    stopPropagation() {},
  },
});
