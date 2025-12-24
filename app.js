// app.js
const { initCloud } = require('./utils/db');

App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'your-cloud-env-id', // 替换为你的云开发环境 ID
        traceUser: true
      });
      
      // 初始化数据库
      initCloud();
      console.log('比赛管理系统启动 - 云开发已初始化');
    } else {
      console.error('云开发未启用，请在微信开发者工具中开通云开发');
    }
  },
  
  globalData: {
    userInfo: null
  }
});

