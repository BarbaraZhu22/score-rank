// pages/index/index.js
const { db, createMatch, getUserId } = require('../../utils/db');

Page({
  data: {
    matches: [],
    showCreateModal: false,
    showAdminModal: false,
    showMasterKeyModal: false,
    newMatchName: '',
    judgeNames: '',
    contestantCount: '',
    matchToDelete: null,
    deleteConfirmCount: 0,
    userId: '',
    isAdmin: false,
    adminPhone: '',
    masterKey: ''
  },

  onLoad() {
    this.loadUserId();
    this.loadMatches();
    this.checkAdminStatus();
  },

  onShow() {
    this.loadMatches();
    this.checkAdminStatus();
  },

  async loadUserId() {
    try {
      const userId = await getUserId();
      this.setData({ userId });
      await this.checkAdminStatus();
    } catch (e) {
      console.error('Failed to load user ID:', e);
    }
  },

  async checkAdminStatus() {
    try {
      const { userId } = this.data;
      if (!userId) return;
      
      const isAdmin = await db.roles.isAdmin(userId);
      this.setData({ isAdmin });
    } catch (e) {
      console.error('Failed to check admin status:', e);
    }
  },

  async loadMatches() {
    try {
      const { isAdmin } = this.data;
      
      // Admin sees all matches, others see only public matches
      const matches = isAdmin 
        ? await db.matches.getAllMatches()
        : await db.matches.getPublicMatches();
      
      this.setData({ matches });
    } catch (e) {
      console.error('Failed to load matches:', e);
      wx.showToast({
        title: '加载比赛列表失败',
        icon: 'none'
      });
    }
  },

  showCreateModal() {
    const { isAdmin } = this.data;
    if (!isAdmin) {
      wx.showToast({
        title: '只有管理员可以创建比赛',
        icon: 'none'
      });
      return;
    }
    this.setData({ showCreateModal: true });
  },

  hideCreateModal() {
    this.setData({ 
      showCreateModal: false,
      newMatchName: '',
      judgeNames: '',
      contestantCount: ''
    });
  },

  showAdminModal() {
    this.setData({ showAdminModal: true, adminPhone: '' });
  },

  hideAdminModal() {
    this.setData({ showAdminModal: false, adminPhone: '' });
  },

  showMasterKeyModal() {
    this.setData({ showMasterKeyModal: true, masterKey: '' });
  },

  hideMasterKeyModal() {
    this.setData({ showMasterKeyModal: false, masterKey: '' });
  },

  onMatchNameInput(e) {
    this.setData({ newMatchName: e.detail.value });
  },

  onJudgeNamesInput(e) {
    this.setData({ judgeNames: e.detail.value });
  },

  onContestantCountInput(e) {
    this.setData({ contestantCount: e.detail.value });
  },

  onAdminPhoneInput(e) {
    this.setData({ adminPhone: e.detail.value });
  },

  onMasterKeyInput(e) {
    this.setData({ masterKey: e.detail.value });
  },

  async handleVerifyPhone() {
    const { adminPhone, userId } = this.data;
    if (!adminPhone.trim()) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      });
      return;
    }

    try {
      const success = await db.roles.verifyPhone(adminPhone.trim(), userId);
      if (success) {
        this.setData({ isAdmin: true, showAdminModal: false });
        wx.showToast({
          title: '管理员验证成功',
          icon: 'success'
        });
        this.loadMatches();
      } else {
        wx.showToast({
          title: '手机号不正确',
          icon: 'none'
        });
      }
    } catch (e) {
      console.error('Failed to verify phone:', e);
      wx.showToast({
        title: '验证失败',
        icon: 'none'
      });
    }
  },

  async handleVerifyMasterKey() {
    const { masterKey, userId } = this.data;
    if (!masterKey.trim()) {
      wx.showToast({
        title: '请输入万能密钥',
        icon: 'none'
      });
      return;
    }

    try {
      const isValid = await db.masterKey.verify(masterKey.trim());
      if (isValid) {
        await db.roles.setAdmin(userId);
        this.setData({ isAdmin: true, showMasterKeyModal: false });
        wx.showToast({
          title: '管理员验证成功',
          icon: 'success'
        });
        this.loadMatches();
      } else {
        wx.showToast({
          title: '万能密钥不正确',
          icon: 'none'
        });
      }
    } catch (e) {
      console.error('Failed to verify master key:', e);
      wx.showToast({
        title: '验证失败',
        icon: 'none'
      });
    }
  },

  async handleCreateMatch() {
    const { newMatchName, judgeNames, contestantCount, userId, isAdmin } = this.data;
    
    if (!isAdmin) {
      wx.showToast({
        title: '只有管理员可以创建比赛',
        icon: 'none'
      });
      return;
    }
    
    if (!newMatchName.trim()) {
      wx.showToast({
        title: '请输入比赛名称',
        icon: 'none'
      });
      return;
    }

    const judgeList = judgeNames.split(/[，,\n]/).map(s => s.trim()).filter(s => s);
    if (judgeList.length === 0) {
      wx.showToast({
        title: '请输入至少一个裁判名称',
        icon: 'none'
      });
      return;
    }

    let count = 0;
    if (contestantCount.trim()) {
      const parsed = parseInt(contestantCount.trim(), 10);
      if (isNaN(parsed) || parsed < 1) {
        wx.showToast({
          title: '请输入有效的海选人数（正整数）',
          icon: 'none'
        });
        return;
      }
      count = parsed;
    }

    const numberList = [];
    for (let i = 1; i <= count; i++) {
      numberList.push(i.toString());
    }

    const contestantList = [];
    const contestantNumbersMap = {};
    numberList.forEach((number) => {
      let name = `选手-${number}`;
      let counter = 1;
      while (contestantList.includes(name)) {
        name = `选手-${number}-${counter}`;
        counter++;
      }
      contestantList.push(name);
      contestantNumbersMap[name] = number;
    });

    try {
      // Default to public for new matches
      const matchId = await createMatch(newMatchName, judgeList, contestantList, contestantNumbersMap, userId, true);
      this.hideCreateModal();
      wx.navigateTo({
        url: `/pages/match/index?id=${matchId}`
      });
    } catch (e) {
      console.error('Failed to create match:', e);
      wx.showToast({
        title: '创建比赛失败',
        icon: 'none'
      });
    }
  },

  handleDeleteClick(e) {
    const { isAdmin } = this.data;
    if (!isAdmin) {
      wx.showToast({
        title: '只有管理员可以删除比赛',
        icon: 'none'
      });
      return;
    }
    
    const matchId = e.currentTarget.dataset.id;
    const match = this.data.matches.find(m => m.id === matchId || m._id === matchId);
    if (match) {
      this.setData({ 
        matchToDelete: match,
        deleteConfirmCount: 0
      });
    }
  },

  async handleConfirmDelete() {
    const { matchToDelete, deleteConfirmCount, isAdmin } = this.data;
    if (!matchToDelete || !isAdmin) return;
    
    if (deleteConfirmCount === 0) {
      this.setData({ deleteConfirmCount: 1 });
      return;
    }
    
    try {
      const matchId = matchToDelete.id || matchToDelete._id;
      await db.matches.delete(matchId);
      
      this.setData({ matchToDelete: null, deleteConfirmCount: 0 });
      this.loadMatches();
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to delete match:', e);
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  handleCancelDelete() {
    this.setData({ 
      matchToDelete: null,
      deleteConfirmCount: 0
    });
  },

  navigateToMatch(e) {
    const matchId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/match/index?id=${matchId}`
    });
  }
});
