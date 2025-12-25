// utils/db.js - WeChat Cloud Database implementation

// 使用微信云开发数据库
// 需要三个集合：
// 1. matches - 存储比赛数据
// 2. roles - 存储管理员角色
// 3. masterKey - 存储万能密钥

// 初始化云开发环境
let dbInstance = null;

// 初始化云开发数据库
function initCloud() {
  if (!wx.cloud) {
    console.error("云开发未初始化，请在 app.js 中初始化云开发");
    return;
  }

  try {
    dbInstance = wx.cloud.database();
  } catch (e) {
    console.error("云开发数据库初始化失败:", e);
  }
}

// 在 app.js 中调用 initCloud() 来初始化

// Database API
const db = {
  matches: {
    // 添加比赛
    async add(match) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      const now = Date.now();
      const uniqueId = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      const newMatch = {
        _id: uniqueId,
        name: match.name,
        judges: match.judges || [],
        contestants: match.contestants || [],
        contestantNumbers: match.contestantNumbers || {},
        scores: match.scores || [],
        isPublic: match.isPublic !== undefined ? match.isPublic : false,
        version: 1,
        createdAt: match.createdAt || now,
        updatedAt: match.updatedAt || now,
        creatorId: match.creatorId || "",
      };

      const result = await dbInstance.collection("matches").add({
        data: newMatch,
      });

      return result._id;
    },

    // 获取比赛（通过 _id）
    async get(id) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      if (!id) {
        throw new Error("Match ID is required");
      }

      try {
        const result = await dbInstance.collection("matches").doc(id).get();
        return result.data || null;
      } catch (e) {
        console.error("Get match error:", e);
        throw e;
      }
    },

    // 通过 _id 获取比赛
    async getByUniqueId(_id) {
      return await this.get(_id);
    },

    // 更新比赛
    async update(id, updates, currentVersion = null) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        // 先获取当前数据检查版本
        const current = await this.get(id);
        if (!current) {
          return { success: false, error: "Match not found" };
        }

        // 版本检查
        if (
          currentVersion !== null &&
          (current.version || 1) > currentVersion
        ) {
          return {
            success: false,
            error: "VERSION_CONFLICT",
            dbVersion: current.version || 1,
            currentVersion: currentVersion,
            match: current,
          };
        }

        // 更新数据（确保版本号总是更新）
        const newVersion = (current.version || 1) + 1;
        const now = Date.now();

        const updateData = {
          ...updates,
          version: newVersion, // 每次更新都增加版本号
          updatedAt: now,
        };

        await dbInstance.collection("matches").doc(id).update({
          data: updateData,
        });

        // 获取更新后的数据
        const updated = await this.get(id);
        return { success: true, version: newVersion, match: updated };
      } catch (e) {
        console.error("Update match error:", e);
        return { success: false, error: e.message || "Update failed" };
      }
    },

    // 删除比赛
    async delete(id) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        await dbInstance.collection("matches").doc(id).remove();
        return true;
      } catch (e) {
        console.error("Delete match error:", e);
        return false;
      }
    },

    // 获取公开比赛（所有用户可见）
    async getPublicMatches() {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        const result = await dbInstance
          .collection("matches")
          .where({
            isPublic: true,
          })
          .orderBy("updatedAt", "desc")
          .get();
        return result.data || [];
      } catch (e) {
        console.error("Get public matches error:", e);
        return [];
      }
    },

    // 获取所有比赛（管理员可见）
    async getAllMatches() {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        const result = await dbInstance
          .collection("matches")
          .orderBy("updatedAt", "desc")
          .get();
        return result.data || [];
      } catch (e) {
        console.error("Get all matches error:", e);
        return [];
      }
    },

    // 合并分数：保留 updatedAt 更大的
    mergeScores(currentScores, dbScores) {
      const scoreMap = new Map();

      // 添加当前分数
      if (Array.isArray(currentScores)) {
        currentScores.forEach((score) => {
          const key = `${score.contestant}|${score.judge}`;
          scoreMap.set(key, score);
        });
      }

      // 合并数据库分数，保留较新的
      if (Array.isArray(dbScores)) {
        dbScores.forEach((dbScore) => {
          const key = `${dbScore.contestant}|${dbScore.judge}`;
          const current = scoreMap.get(key);

          if (!current) {
            scoreMap.set(key, dbScore);
          } else {
            const currentTime = current.updatedAt || 0;
            const dbTime = dbScore.updatedAt || 0;
            if (dbTime > currentTime) {
              scoreMap.set(key, dbScore);
            }
          }
        });
      }

      return Array.from(scoreMap.values());
    },

    // 合并match数据：处理版本冲突时自动合并
    async mergeMatchData(matchId, currentData, dbMatch) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      // 1. 合并scores：对比每条同judge同contestant的score，取updatedAt最新的
      const currentScores = currentData?.scores || [];
      const dbScores = dbMatch.scores || [];
      const mergedScores = this.mergeScores(currentScores, dbScores);

      // 2. 合并contestants：保留多的
      const currentContestants = currentData?.contestants || [];
      const dbContestants = dbMatch.contestants || [];
      const contestantSet = new Set([...currentContestants, ...dbContestants]);
      const mergedContestants = Array.from(contestantSet);

      // 3. 合并contestantNumbers：保留多的
      const currentNumbers = currentData?.contestantNumbers || {};
      const dbNumbers = dbMatch.contestantNumbers || {};
      const mergedNumbers = { ...dbNumbers, ...currentNumbers };
      // 确保所有contestants都有对应的number（如果没有则保留原有的）
      mergedContestants.forEach((contestant) => {
        if (!mergedNumbers[contestant]) {
          // 如果当前数据中有，优先使用当前的
          if (currentNumbers[contestant]) {
            mergedNumbers[contestant] = currentNumbers[contestant];
          } else if (dbNumbers[contestant]) {
            mergedNumbers[contestant] = dbNumbers[contestant];
          }
        }
      });

      // 4. 更新版本号：先更新成数据库的版本，然后+1
      const dbVersion = dbMatch.version || 1;
      const newVersion = dbVersion + 1;
      const now = Date.now();

      const updateData = {
        scores: mergedScores,
        contestants: mergedContestants,
        contestantNumbers: mergedNumbers,
        version: newVersion,
        updatedAt: now,
      };

      await dbInstance.collection("matches").doc(matchId).update({
        data: updateData,
      });

      // 获取更新后的数据
      const updated = await this.get(matchId);
      return { success: true, version: newVersion, match: updated };
    },
  },

  roles: {
    // 获取用户角色
    async get(userId) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        const result = await dbInstance
          .collection("roles")
          .where({
            userId: userId,
          })
          .get();

        return result.data && result.data.length > 0 ? result.data[0] : null;
      } catch (e) {
        console.error("Get role error:", e);
        return null;
      }
    },

    // 设置用户为管理员
    async setAdmin(userId, phoneNumber = null) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        // 检查是否已存在
        const existing = await this.get(userId);

        const roleData = {
          userId,
          isAdmin: true,
          phoneNumber,
          verifiedAt: Date.now(),
        };

        if (existing) {
          // 更新
          await dbInstance.collection("roles").doc(existing._id).update({
            data: roleData,
          });
        } else {
          // 添加
          await dbInstance.collection("roles").add({
            data: roleData,
          });
        }

        return true;
      } catch (e) {
        console.error("Set admin error:", e);
        return false;
      }
    },

    // 检查是否为管理员
    async isAdmin(userId) {
      const role = await this.get(userId);
      return role ? role.isAdmin === true : false;
    },

    // 添加管理员密钥
    async addAdminPhone(phoneNumber) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        // 检查密钥是否已存在
        const result = await dbInstance
          .collection("roles")
          .where({
            phoneNumber: phoneNumber,
            userId: null, // 纯管理员密钥记录，无绑定用户
          })
          .get();

        if (result.data && result.data.length > 0) {
          return false; // 密钥已存在
        }

        // 添加管理员密钥记录
        await dbInstance.collection("roles").add({
          data: {
            userId: null,
            phoneNumber,
            isAdmin: true,
            verifiedAt: null,
          },
        });

        return true;
      } catch (e) {
        console.error("Add admin phone error:", e);
        return false;
      }
    },

    async verifyPhone(phoneNumber) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        // 只查询：是否存在该手机号的管理员记录（忽略userId）
        const result = await dbInstance
          .collection("roles")
          .where({
            phoneNumber, // 仅对比手机号
            isAdmin: true, // 必须是管理员
          })
          .get();

        // 只要存在该手机号的管理员记录，就返回true
        return result.data.length > 0;
      } catch (e) {
        console.error("Verify phone error:", e);
        return false;
      }
    },
  },

  masterKey: {
    // 获取万能密钥
    async get() {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        const result = await dbInstance.collection("masterKey").limit(1).get();

        if (result.data && result.data.length > 0) {
          return result.data[0].key || null;
        }

        return null;
      } catch (e) {
        console.error("Get master key error:", e);
        return null;
      }
    },

    // 设置万能密钥
    async set(key) {
      if (!dbInstance) {
        throw new Error("云开发数据库未初始化");
      }

      try {
        // 检查是否已存在
        const result = await dbInstance.collection("masterKey").limit(1).get();

        if (result.data && result.data.length > 0) {
          // 更新
          await dbInstance
            .collection("masterKey")
            .doc(result.data[0]._id)
            .update({
              data: { key },
            });
        } else {
          // 添加
          await dbInstance.collection("masterKey").add({
            data: { key },
          });
        }

        return true;
      } catch (e) {
        console.error("Set master key error:", e);
        return false;
      }
    },

    // 验证万能密钥
    async verify(key) {
      const masterKey = await this.get();
      return masterKey === key;
    },
  },
};

// Helper function to create a new match
async function createMatch(
  name,
  judges = [],
  contestants = [],
  contestantNumbers = {},
  creatorId,
  isPublic = false
) {
  if (!creatorId) {
    throw new Error("Creator ID is required");
  }

  const matchId = await db.matches.add({
    name,
    judges,
    contestants,
    contestantNumbers,
    creatorId,
    isPublic,
  });

  return matchId;
}

// Helper function to get match data with related scores
async function getMatchData(matchId) {
  const match = await db.matches.get(matchId);
  if (!match) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  const scores = match.scores || [];

  return {
    match,
    judges: match.judges || [],
    contestants: match.contestants || [],
    scores,
  };
}

// Refresh and merge match data
async function refreshMatchData(matchId, currentData) {
  const dbMatch = await db.matches.get(matchId);
  if (!dbMatch) {
    throw new Error(`Match with id ${matchId} not found`);
  }

  // 合并分数
  const currentScores = currentData?.scores || [];
  const dbScores = dbMatch.scores || [];
  const mergedScores = db.matches.mergeScores(currentScores, dbScores);

  // 更新数据库
  const updateResult = await db.matches.update(matchId, {
    scores: mergedScores,
  });

  if (!updateResult.success) {
    throw new Error(updateResult.error || "Update failed");
  }

  return {
    match: updateResult.match,
    judges: updateResult.match.judges || [],
    contestants: updateResult.match.contestants || [],
    scores: mergedScores,
  };
}

// Helper function to get user ID from WeChat
function getUserId() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: "用于标识用户身份",
      success: (res) => {
        const userId =
          wx.getStorageSync("userId") ||
          res.userInfo.nickName + "_" + Date.now();
        if (!wx.getStorageSync("userId")) {
          wx.setStorageSync("userId", userId);
        }
        resolve(userId);
      },
      fail: () => {
        let userId = wx.getStorageSync("userId");
        if (!userId) {
          userId =
            "user_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 9);
          wx.setStorageSync("userId", userId);
        }
        resolve(userId);
      },
    });
  });
}

// 日期格式化工具：将时间戳（number）转为标准日期格式（如 yyyy-MM-dd HH:mm:ss）
function formatTime(timestamp) {
  // 校验参数：如果不是有效数字，返回空字符串或默认提示
  if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp <= 0) {
    return "未知时间";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0"); // 月份从0开始，补零
  const day = date.getDate().toString().padStart(2, "0"); // 日期补零
  const hours = date.getHours().toString().padStart(2, "0"); // 小时补零
  const minutes = date.getMinutes().toString().padStart(2, "0"); // 分钟补零
  const seconds = date.getSeconds().toString().padStart(2, "0"); // 秒补零

  // 可根据需求调整格式，例如：
  // 简化格式：`${year}-${month}-${day}`
  // 完整格式：`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  db,
  createMatch,
  getMatchData,
  refreshMatchData,
  getUserId,
  initCloud,
  formatTime,
};
