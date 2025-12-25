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
    // 增量更新相关
    pendingScores: [], // 待更新的分数增量 [{contestant, judge, value, updatedAt}]
    pendingContestants: [], // 待添加的选手
    pendingContestantNumbers: {}, // 待添加的选手编号
    pendingRemoveContestants: [], // 待删除分数的选手列表
    isUpdating: false, // 是否正在更新
    updateTimer: null, // 防抖定时器
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
        // 获取管理员状态后强制刷新列表
        this.loadMatchData(true);
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

  // 计算tableData：将scores转换为按contestant组织的格式，包含增量数据
  calculateTableData(matchData, pendingScores = [], pendingContestants = [], pendingContestantNumbers = {}) {
    if (!matchData || !matchData.match) return [];
    
    const { scores = [], contestants = [], judges = [] } = matchData;
    const scoreMap = {}; // {contestant|judge: value}
    const updatedAtMap = {}; // {contestant: maxUpdatedAt}
    
    // 合并基础数据和增量数据
    const allScores = [...scores, ...pendingScores];
    const allContestants = [...contestants, ...pendingContestants];
    const allContestantNumbers = { ...(matchData.match.contestantNumbers || {}), ...pendingContestantNumbers };

    // 1. 构建scoreMap和updatedAtMap（增量数据会覆盖基础数据）
    allScores.forEach((score) => {
      if (!score?.contestant || !score?.judge) return;
      const key = `${score.contestant}|${score.judge}`;
      const value =
        score.value !== null && score.value !== undefined
          ? parseFloat(score.value) || null
          : null;
      // 如果增量数据的 updatedAt 更大，则使用增量数据
      const existingScore = scoreMap[key];
      const scoreUpdatedAt = score.updatedAt || 0;
      if (!existingScore || scoreUpdatedAt > (existingScore.updatedAt || 0)) {
        scoreMap[key] = { value, updatedAt: scoreUpdatedAt };
      }

      // 记录每个contestant的最大updatedAt
      const contestant = score.contestant;
      if (!updatedAtMap[contestant] || scoreUpdatedAt > updatedAtMap[contestant]) {
        updatedAtMap[contestant] = scoreUpdatedAt;
      }
    });

    // 2. 构建tableData数组
    const tableData = [];
    allContestants.forEach((contestant) => {
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
        const scoreInfo = scoreMap[key];
        const value = scoreInfo ? scoreInfo.value : null;
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
  async loadMatchData(force = false) {
    const { matchId, isRefreshing } = this.data;
    if (!matchId) return;

    // 防止重复调用（除非强制刷新）
    if (isRefreshing && !force) {
      return;
    }

    this.setData({ isRefreshing: true });

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
      // 计算tableData（包含增量数据）
      const { 
        pendingScores = [], 
        pendingContestants = [], 
        pendingContestantNumbers = {},
        pendingRemoveContestants = [],
      } = this.data;
      // 过滤掉待删除选手的分数
      const filteredScores = (matchData.scores || []).filter(
        (s) => !pendingRemoveContestants.includes(s.contestant)
      );
      const filteredMatchData = {
        ...matchData,
        scores: filteredScores,
      };
      const tableData = this.calculateTableData(filteredMatchData, pendingScores, pendingContestants, pendingContestantNumbers);
      
      this.setData({
        matchData,
        currentVersion: data.match.version || 1,
        tableData, // 响应式的tableData
        isRefreshing: false,
      });
    } catch (e) {
      console.error("Failed to load match data:", e);
      this.setData({ isRefreshing: false });
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

  // 处理增量更新（从组件接收）
  handleIncrementalUpdate(e) {
    const { scores, contestants, contestantNumbers, removeContestantScores } = e.detail;
    
    // 合并增量到待更新队列
    const { 
      pendingScores = [], 
      pendingContestants = [], 
      pendingContestantNumbers = {},
      pendingRemoveContestants = [],
    } = this.data;
    
    // 合并分数：增量覆盖旧值（不需要删除，直接用增量覆盖）
    let newPendingScores = [...pendingScores];
    let newPendingRemoveContestants = [...pendingRemoveContestants];
    
    // 添加新的分数增量（覆盖相同 contestant+judge 的旧增量）
    if (scores && scores.length > 0) {
      scores.forEach((newScore) => {
        // 移除相同 contestant+judge 的旧增量
        const index = newPendingScores.findIndex(
          (s) => s.contestant === newScore.contestant && s.judge === newScore.judge
        );
        if (index !== -1) {
          newPendingScores.splice(index, 1);
        }
        newPendingScores.push(newScore);
      });
    }
    
    // 合并选手
    const newPendingContestants = [...pendingContestants];
    if (contestants && contestants.length > 0) {
      contestants.forEach((contestant) => {
        if (!newPendingContestants.includes(contestant)) {
          newPendingContestants.push(contestant);
        }
      });
    }
    
    // 合并选手编号
    const newPendingContestantNumbers = { ...pendingContestantNumbers, ...(contestantNumbers || {}) };
    
    // 立即更新 UI（在计算 tableData 时，需要从基础数据中移除待删除选手的分数）
    this.setData({
      pendingScores: newPendingScores,
      pendingContestants: newPendingContestants,
      pendingContestantNumbers: newPendingContestantNumbers,
      pendingRemoveContestants: newPendingRemoveContestants,
    }, () => {
      // 重新计算 tableData
      const { matchData } = this.data;
      if (matchData) {
        // 在计算时，需要过滤掉待删除选手的分数
        const filteredScores = (matchData.scores || []).filter(
          (s) => !newPendingRemoveContestants.includes(s.contestant)
        );
        const filteredMatchData = {
          ...matchData,
          scores: filteredScores,
        };
        const tableData = this.calculateTableData(
          filteredMatchData,
          newPendingScores,
          newPendingContestants,
          newPendingContestantNumbers
        );
        this.setData({ tableData });
      }
    });
    
    // 防抖：延迟执行更新
    this.scheduleUpdate();
  },

  // 调度更新（防抖）
  scheduleUpdate() {
    // 清除之前的定时器
    if (this.data.updateTimer) {
      clearTimeout(this.data.updateTimer);
    }
    
    // 设置新的定时器（300ms 防抖）
    const timer = setTimeout(() => {
      this.processUpdateQueue();
    }, 300);
    
    this.setData({ updateTimer: timer });
  },

  // 处理更新队列
  async processUpdateQueue() {
    const { 
      isUpdating, 
      pendingScores, 
      pendingContestants, 
      pendingContestantNumbers,
      pendingRemoveContestants,
      matchId, 
      currentVersion 
    } = this.data;
    
    // 如果正在更新或没有待更新数据，直接返回
    if (isUpdating || (!pendingScores.length && !pendingContestants.length && !pendingRemoveContestants.length)) {
      return;
    }
    
    this.setData({ isUpdating: true });
    
    try {
      // 准备更新数据
      const updateData = {};
      
      // 只处理真正需要删除的选手（pendingRemoveContestants）
      if (pendingRemoveContestants.length > 0) {
        updateData._removeContestantScores = pendingRemoveContestants;
      }
      
      // 增量分数直接覆盖（不需要删除，直接用增量覆盖）
      if (pendingScores.length > 0) {
        updateData._addScores = pendingScores.filter(s => s.value !== null);
      }
      
      if (pendingContestants.length > 0) {
        // 只添加新的选手（不在现有列表中的）
        const { matchData } = this.data;
        const existingContestants = matchData?.match?.contestants || [];
        const newContestants = pendingContestants.filter(c => !existingContestants.includes(c));
        if (newContestants.length > 0) {
          updateData._addContestant = newContestants;
        }
      }
      
      if (Object.keys(pendingContestantNumbers).length > 0) {
        updateData._setContestantNumber = pendingContestantNumbers;
      }
      
      // 提交更新
      const updateResult = await db.matches.update(matchId, updateData, currentVersion);
      
      if (!updateResult.success) {
        if (updateResult.error === "VERSION_CONFLICT") {
          // 版本冲突：合并增量
          await this.handleVersionConflict(updateResult.match);
          // 重试更新
          await this.processUpdateQueue();
          return;
        } else {
          throw new Error(updateResult.error || "更新失败");
        }
      }
      
      // 更新成功：清空增量，刷新数据
      this.setData({
        pendingScores: [],
        pendingContestants: [],
        pendingContestantNumbers: {},
        pendingRemoveContestants: [],
        currentVersion: updateResult.match.version,
      });
      
      // 刷新数据（会重新计算 tableData）
      await this.loadMatchData(true);
      
    } catch (error) {
      console.error("增量更新失败:", error);
      wx.showToast({ title: "更新失败，请重试", icon: "none" });
    } finally {
      this.setData({ isUpdating: false });
    }
  },

  // 处理版本冲突：合并增量
  async handleVersionConflict(latestMatch) {
    const { pendingScores = [], pendingContestants = [], pendingContestantNumbers = {}, matchData } = this.data;
    
    if (!latestMatch) {
      latestMatch = await db.matches.get(this.data.matchId);
    }
    
    // 合并增量：比较 updatedAt，保留最新的
    const mergedScores = [...(latestMatch.scores || [])];
    const scoreMap = new Map();
    
    // 先添加服务器数据
    mergedScores.forEach((score) => {
      const key = `${score.contestant}|${score.judge}`;
      scoreMap.set(key, score);
    });
    
    // 合并增量：如果增量的 updatedAt 更大，则使用增量
    pendingScores.forEach((pendingScore) => {
      const key = `${pendingScore.contestant}|${pendingScore.judge}`;
      const existing = scoreMap.get(key);
      if (!existing || (pendingScore.updatedAt || 0) > (existing.updatedAt || 0)) {
        scoreMap.set(key, pendingScore);
      }
    });
    
    // 合并选手
    const mergedContestants = [...new Set([...(latestMatch.contestants || []), ...pendingContestants])];
    
    // 合并选手编号
    const mergedContestantNumbers = {
      ...(latestMatch.contestantNumbers || {}),
      ...pendingContestantNumbers,
    };
    
    // 更新 matchData
    const updatedMatch = {
      ...latestMatch,
      scores: Array.from(scoreMap.values()),
      contestants: mergedContestants,
      contestantNumbers: mergedContestantNumbers,
    };
    
    // 重新计算增量（基于更新后的数据）
    const newPendingScores = pendingScores.filter((pending) => {
      const key = `${pending.contestant}|${pending.judge}`;
      const serverScore = scoreMap.get(key);
      return !serverScore || (pending.updatedAt || 0) > (serverScore.updatedAt || 0);
    });
    
    this.setData({
      matchData: {
        ...matchData,
        match: updatedMatch,
        scores: updatedMatch.scores,
        contestants: updatedMatch.contestants,
      },
      pendingScores: newPendingScores,
      pendingContestants: pendingContestants.filter(c => !mergedContestants.includes(c)),
      currentVersion: updatedMatch.version,
    });
  },
});
