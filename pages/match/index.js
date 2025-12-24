// pages/match/index.js
const { db, getMatchData, refreshMatchData, getUserId } = require('../../utils/db');
const { applyActions } = require('../../utils/actions');

Page({
  data: {
    matchId: null,
    matchData: null,
    userId: '',
    isAdmin: false,
    currentVersion: null,
    isRefreshing: false
  },

  onLoad(options) {
    const matchId = options._id || options.id;
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
    
    console.log("Match page onLoad, matchId:", matchId);
    this.setData({ 
      matchId: matchId
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
    const { matchId, isAdmin } = this.data;
    
    if (!matchId) return;
    
    try {
      const match = await db.matches.get(matchId);
      
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
    const { matchId } = this.data;
    
    if (!matchId) return;
    
    try {
      const data = await getMatchData(matchId);
      
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
    const { matchId, matchData } = this.data;
    
    if (!matchId || !matchData) return;
    
    this.setData({ isRefreshing: true });
    
    try {
      const refreshedData = await refreshMatchData(matchId, matchData);
      
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
