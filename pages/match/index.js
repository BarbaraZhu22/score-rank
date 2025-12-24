// pages/match/index.js
const { db, getMatchData, refreshMatchData, getUserId } = require('../../utils/db');
const { applyActions } = require('../../utils/actions');

Page({
  data: {
    matchId: null,
    matchUniqueId: null,
    matchData: null,
    userId: '',
    isAdmin: false,
    currentVersion: null,
    isRefreshing: false
  },

  onLoad(options) {
    const matchId = options.id || options._id;
    if (!matchId) {
      wx.showToast({
        title: '比赛ID不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({ 
      matchId: options.id,
      matchUniqueId: options._id || matchId
    });
    
    this.loadUserId();
  },

  async loadUserId() {
    try {
      const userId = await getUserId();
      const isAdmin = await db.roles.isAdmin(userId);
      this.setData({ userId, isAdmin });
      await this.checkPermissions();
      await this.loadMatchData();
    } catch (e) {
      console.error('Failed to load user ID:', e);
    }
  },

  async checkPermissions() {
    const { matchId, matchUniqueId, isAdmin } = this.data;
    
    try {
      let match;
      if (matchUniqueId && !matchId) {
        match = await db.matches.getByUniqueId(matchUniqueId);
      } else {
        match = await db.matches.get(matchId || matchUniqueId);
      }
      
      if (!match) {
        wx.showToast({
          title: '比赛不存在',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // Check access: admin can access all, others can only access public matches
      if (!isAdmin && !match.isPublic) {
        wx.showToast({
          title: '您没有权限访问此比赛',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }
    } catch (e) {
      console.error('Failed to check permissions:', e);
    }
  },

  async loadMatchData() {
    const { matchId, matchUniqueId } = this.data;
    const checkId = matchId || matchUniqueId;
    
    if (!checkId) return;
    
    try {
      let data;
      if (matchUniqueId && !matchId) {
        const match = await db.matches.getByUniqueId(matchUniqueId);
        if (!match) {
          throw new Error('Match not found');
        }
        data = await getMatchData(match.id);
      } else {
        data = await getMatchData(checkId);
      }
      
      this.setData({ 
        matchData: data,
        currentVersion: data.match.version || 1
      });
    } catch (e) {
      console.error('Failed to load match data:', e);
      wx.showToast({
        title: '加载比赛数据失败',
        icon: 'none'
      });
    }
  },

  async handleRefresh() {
    const { matchId, matchUniqueId, matchData } = this.data;
    const checkId = matchId || matchUniqueId;
    
    if (!checkId || !matchData) return;
    
    this.setData({ isRefreshing: true });
    
    try {
      const refreshedData = await refreshMatchData(checkId, matchData);
      
      this.setData({ 
        matchData: refreshedData,
        currentVersion: refreshedData.match.version || 1,
        isRefreshing: false
      });
      
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to refresh:', e);
      this.setData({ isRefreshing: false });
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      });
    }
  },


  navigateBack() {
    wx.navigateBack();
  }
});
