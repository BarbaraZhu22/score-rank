// app.js
const { initCloud } = require('./utils/db');

App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7goxlfat431b20ef', // 替换为你的云开发环境 ID
        traceUser: true
      });
      
      // 初始化数据库
      initCloud();
    } else {
      console.error('云开发未启用，请在微信开发者工具中开通云开发');
    }
  },
  
  globalData: {
    userInfo: null
  }
});

