// pages/match/index.js
const {
  db,
  getMatchData,
  refreshMatchData,
  getUserId,
  formatTime,
} = require("../../utils/db");
const { applyActions } = require("../../utils/actions");

Page({
  data: {
    matchId: null,
    matchData: null,
    tableData: [], // 响应式的表格数据 [{updatedAt, contestant, judge1:xx, judge2:xx, total}]
    userId: "",
    isAdmin: false,
    currentVersion: null,
    isRefreshing: false,
  },

  onLoad(options) {
    const matchId = options._id || options.id;
    if (!matchId) {
      wx.showToast({ title: "比赛ID不存在", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ matchId }, () => {
      this.loadUserId();
    });
  },

  async loadUserId() {
    try {
      const userId = await getUserId();
      const isAdmin = await db.roles.isAdmin(userId);
      this.setData({ userId, isAdmin }, () => {
        this.checkPermissions();
        this.loadMatchData();
      });
    } catch (e) {
      console.error("Failed to load user ID:", e);
    }
  },

  async checkPermissions() {
    const { matchId, isAdmin } = this.data;
    if (!matchId) return;

    try {
      const match = await db.matches.get(matchId);
      if (!match) {
        wx.showToast({ title: "比赛不存在", icon: "none" });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      if (!isAdmin && !match.isPublic) {
        wx.showToast({ title: "您没有权限访问此比赛", icon: "none" });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
    } catch (e) {
      console.error("Failed to check permissions:", e);
    }
  },

  // 计算tableData：将scores转换为按contestant组织的格式 [{updatedAt, contestant, judge1:xx, judge2:xx, total}]
  calculateTableData(matchData) {
    if (!matchData || !matchData.match) return [];
    
    const { scores = [], contestants = [], judges = [] } = matchData;
    const scoreMap = {}; // {contestant|judge: value}
    const updatedAtMap = {}; // {contestant: maxUpdatedAt}

    // 1. 构建scoreMap和updatedAtMap
    scores.forEach((score) => {
      if (!score?.contestant || !score?.judge) return;
      const key = `${score.contestant}|${score.judge}`;
      const value =
        score.value !== null && score.value !== undefined
          ? parseFloat(score.value) || null
          : null;
      scoreMap[key] = value;

      // 记录每个contestant的最大updatedAt
      const contestant = score.contestant;
      const updatedAt = score.updatedAt || 0;
      if (!updatedAtMap[contestant] || updatedAt > updatedAtMap[contestant]) {
        updatedAtMap[contestant] = updatedAt;
      }
    });

    // 2. 构建tableData数组
    const tableData = [];
    contestants.forEach((contestant) => {
      if (!contestant) return;

      const row = {
        contestant,
        updatedAt: updatedAtMap[contestant] || 0,
      };

      // 为每个judge添加分数
      let total = 0;
      judges.forEach((judge) => {
        if (!judge) return;
        const key = `${contestant}|${judge}`;
        const value = scoreMap[key];
        row[judge] = value !== null && !isNaN(value) ? value : null;
        if (value !== null && !isNaN(value) && isFinite(value)) {
          total += value;
        }
      });

      row.total = total;
      tableData.push(row);
    });

    return tableData;
  },

  // 【修复：确保loadMatchData每次都重新获取最新数据，并正确格式化】
  async loadMatchData() {
    const { matchId } = this.data;
    if (!matchId) return;

    try {
      const data = await getMatchData(matchId);
      const formattedMatch = {
        ...data.match,
        formattedUpdatedAt: formatTime(data.match.updatedAt),
      };
      const matchData = {
        ...data,
        match: formattedMatch,
      };
      // 计算tableData
      const tableData = this.calculateTableData(matchData);
      
      this.setData({
        matchData,
        currentVersion: data.match.version || 1,
        tableData, // 响应式的tableData
      });
    } catch (e) {
      console.error("Failed to load match data:", e);
      wx.showToast({ title: "加载比赛数据失败", icon: "none" });
    }
  },

  async handleRefresh() {
    const { matchId } = this.data;
    if (!matchId) return;

    this.setData({ isRefreshing: true });

    try {
      // 直接重新加载数据（相当于触发update）
      await this.loadMatchData();
      this.setData({ isRefreshing: false });
      wx.showToast({ title: "刷新成功", icon: "success" });
    } catch (e) {
      console.error("Failed to refresh:", e);
      this.setData({ isRefreshing: false });
      wx.showToast({ title: "刷新失败", icon: "none" });
    }
  },

  async handleTogglePublic() {
    const { matchId, matchData, isAdmin, currentVersion } = this.data;
    if (!matchId || !matchData || !isAdmin) {
      wx.showToast({ title: "只有管理员可以操作", icon: "none" });
      return;
    }

    try {
      const newIsPublic = !matchData.match.isPublic;
      const updateResult = await db.matches.update(
        matchId,
        { isPublic: newIsPublic },
        currentVersion
      );

      if (!updateResult.success) {
        if (updateResult.error === "VERSION_CONFLICT") {
          // 版本冲突，先刷新再重试
          await this.loadMatchData();
          const { matchData: latestMatchData, currentVersion: latestVersion } = this.data;
          const retryResult = await db.matches.update(
            matchId,
            { isPublic: newIsPublic },
            latestVersion
          );
          if (!retryResult.success) {
            throw new Error(retryResult.error || "更新失败");
          }
        } else {
          throw new Error(updateResult.error || "更新失败");
        }
      }

      // 更新成功后重新加载数据
      await this.loadMatchData();
      wx.showToast({
        title: newIsPublic ? "已设为公开" : "已设为私有",
        icon: "success",
      });
    } catch (e) {
      console.error("Failed to toggle public:", e);
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
    }
  },

  navigateBack() {
    wx.navigateBack();
  },
});
