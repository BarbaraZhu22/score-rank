# 比赛管理系统 - 微信小程序版

## 功能特性

- 💾 **云开发数据库**：使用微信云开发免费版数据库存储数据
- 🔐 **管理员系统**：基于手机号和万能密钥的权限管理
- 📊 **版本控制**：防止数据冲突，支持刷新合并
- 🔄 **数据同步**：多设备数据同步

## 技术栈

- 微信小程序原生框架
- 微信云开发数据库（免费版）
- 版本控制系统

## 快速开始

### 1. 开通云开发

1. 在微信开发者工具中打开项目
2. 点击工具栏的"云开发"按钮
3. 开通云开发服务（免费版即可）
4. 记录云开发环境 ID

### 2. 配置云开发环境 ID

编辑 `app.js`，将 `your-cloud-env-id` 替换为你的云开发环境 ID：

```javascript
wx.cloud.init({
  env: 'your-cloud-env-id', // 替换为你的云开发环境 ID
  traceUser: true
});
```

### 3. 创建云数据库集合

在微信开发者工具的云开发控制台中，创建以下三个集合：

#### 3.1 matches 集合（比赛数据）

**权限设置**：
- 所有用户可读
- 仅创建者可写

**字段结构**：
```javascript
{
  _id: string,              // 自动生成
  name: string,             // 比赛名称
  judges: array,            // 裁判列表 ["A", "B", "C"]
  contestants: array,       // 选手列表 ["选手-1", "选手-2"]
  contestantNumbers: object, // 选手编号映射 {"选手-1": "1"}
  scores: array,            // 分数数组
  // scores 数组项结构：
  // {
  //   contestant: string,   // 选手名称
  //   judge: string,        // 裁判名称
  //   value: number | null, // 分数值
  //   updatedAt: number     // 更新时间戳
  // }
  isPublic: boolean,        // 是否公开（true=所有用户可见，false=仅管理员可见）
  version: number,          // 版本号（用于冲突检测）
  createdAt: number,        // 创建时间戳
  updatedAt: number,        // 更新时间戳
  creatorId: string         // 创建者用户 ID
}
```

**索引**：
- `isPublic` (升序)
- `updatedAt` (降序)

#### 3.2 roles 集合（管理员角色）

**权限设置**：
- 所有用户可读
- 仅创建者可写

**字段结构**：
```javascript
{
  _id: string,              // 自动生成
  userId: string,           // 用户 ID（可为空，用于手机号验证）
  isAdmin: boolean,         // 是否为管理员
  phoneNumber: string,      // 管理员手机号（可选）
  verifiedAt: number        // 验证时间戳
}
```

**索引**：
- `userId` (升序)
- `phoneNumber` (升序)

#### 3.3 masterKey 集合（万能密钥）

**权限设置**：
- 仅管理员可读写

**字段结构**：
```javascript
{
  _id: string,              // 自动生成
  key: string               // 万能密钥字符串
}
```

**初始数据**：
创建一条记录，设置 `key` 字段为你的万能密钥（例如：`admin2025`）

### 4. 配置项目

1. 在 `project.config.json` 中配置你的 `appid`
2. 确保云开发已开通并配置了环境 ID

### 5. 初始化管理员

#### 方式一：通过手机号

在云开发控制台的 `roles` 集合中，手动添加一条记录：

```javascript
{
  userId: null,
  phoneNumber: "13800138000",  // 替换为管理员手机号
  isAdmin: true,
  verifiedAt: null
}
```

#### 方式二：通过万能密钥

在云开发控制台的 `masterKey` 集合中，创建一条记录：

```javascript
{
  key: "admin2025"  // 替换为你想要的万能密钥
}
```

### 6. 数据结构说明

#### Match (比赛)
```javascript
{
  _id: string,              // 云数据库自动生成的 ID
  name: string,             // 比赛名称
  judges: string[],          // 裁判列表
  contestants: string[],     // 选手列表
  contestantNumbers: {},    // 选手编号映射
  scores: [                 // 分数数组（存储在 match 中）
    {
      contestant: string,
      judge: string,
      value: number | null,
      updatedAt: number
    }
  ],
  isPublic: boolean,        // 是否公开
  version: number,          // 版本号
  createdAt: number,        // 创建时间
  updatedAt: number,        // 更新时间
  creatorId: string         // 创建者用户 ID
}
```

#### Role (角色)
```javascript
{
  _id: string,              // 云数据库自动生成的 ID
  userId: string,           // 用户 ID
  isAdmin: boolean,         // 是否为管理员
  phoneNumber: string,      // 管理员手机号（可选）
  verifiedAt: number         // 验证时间
}
```

#### MasterKey (万能密钥)
```javascript
{
  _id: string,              // 云数据库自动生成的 ID
  key: string               // 万能密钥
}
```

### 7. 管理员系统

#### 管理员验证方式

1. **手机号验证**
   - 在首页点击"管理员登录"
   - 输入管理员手机号
   - 系统验证手机号是否正确（从 `roles` 集合中查找）

2. **万能密钥验证**
   - 在首页点击"万能密钥"
   - 输入万能密钥
   - 系统验证密钥是否正确（从 `masterKey` 集合中查找）

#### 管理员权限

- ✅ 查看所有比赛（包括私有比赛）
- ✅ 创建比赛
- ✅ 编辑比赛（修改分数、添加选手等）
- ✅ 删除比赛

#### 普通用户权限

- ✅ 查看公开比赛（isPublic = true）
- ❌ 无法查看私有比赛
- ❌ 无法创建、编辑、删除比赛

### 8. 比赛可见性

- **公开比赛 (isPublic = true)**：所有用户都可以在比赛列表中看到
- **私有比赛 (isPublic = false)**：只有管理员可以看到

### 9. 版本控制系统

- 每个比赛都有 `version` 字段
- 每次更新时版本号自动递增
- 如果检测到版本冲突，会提示用户刷新
- 刷新时会合并数据（保留较新的分数）

### 10. 使用指南

#### 管理员登录
1. 在比赛列表页点击"管理员登录"或"万能密钥"
2. 输入手机号或万能密钥
3. 验证成功后获得管理员权限

#### 创建比赛
1. 管理员在比赛列表页点击"+ 创建比赛"
2. 输入比赛名称（必填）
3. 输入裁判名称（必填，用逗号或换行分隔）
4. 输入海选人数（可选）
5. 点击创建（默认创建为公开比赛）

#### 编辑表格
1. 管理员双击单元格可手动修改分数
2. 自动计算总分
3. 空值用不同颜色显示

#### 刷新数据
1. 在比赛详情页点击"🔄 刷新"按钮
2. 系统会合并当前数据和数据库数据
3. 相同 contestant + judge 的分数，保留 updatedAt 更大的

### 11. 云数据库权限配置

#### matches 集合权限
- **读取权限**：所有用户
- **写入权限**：仅创建者可写
- **更新权限**：仅创建者可更新

#### roles 集合权限
- **读取权限**：所有用户
- **写入权限**：仅创建者可写

#### masterKey 集合权限
- **读取权限**：仅管理员
- **写入权限**：仅管理员

### 12. 注意事项

1. **云开发环境 ID**：必须在 `app.js` 中正确配置
2. **数据库权限**：确保按照上述说明配置集合权限
3. **管理员权限**：管理员权限存储在云数据库中，跨设备同步
4. **版本控制**：每次更新比赛时都会检查版本，防止数据冲突
5. **用户 ID**：系统会自动生成和管理用户 ID，存储在本地

### 13. 云开发免费版限制

- 数据库存储：2GB
- 数据库读取：5万次/天
- 数据库写入：3万次/天
- 数据库更新：3万次/天

对于小型比赛管理系统，免费版通常足够使用。

### 14. 故障排查

#### 问题：云开发数据库未初始化
**解决**：检查 `app.js` 中的云开发环境 ID 是否正确配置

#### 问题：无法创建比赛
**解决**：检查 `matches` 集合的权限设置，确保"所有用户可读，仅创建者可写"

#### 问题：管理员验证失败
**解决**：
1. 检查 `roles` 集合中是否有对应的手机号记录
2. 检查 `masterKey` 集合中是否有密钥记录
3. 检查集合权限设置

#### 问题：无法查看比赛
**解决**：检查 `matches` 集合的权限设置，确保"所有用户可读"

## 项目结构

```
score-rank-wx/
├── app.js              # 小程序入口（包含云开发初始化）
├── app.json            # 小程序配置
├── app.wxss            # 全局样式
├── sitemap.json        # 小程序站点地图
├── project.config.json # 项目配置
├── package.json        # 项目配置
├── pages/
│   ├── index/          # 比赛列表页（含管理员登录）
│   └── match/          # 比赛详情页
├── components/
│   ├── table-view/     # 评分表格组件
│   └── confirm-modal/  # 确认弹窗组件
└── utils/
    ├── db.js           # 云数据库封装
    └── actions.js      # Action handler
```

## 许可证

MIT
