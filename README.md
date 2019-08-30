# push-vivo

> Vivo推送Node服务

根据Vivo提供的推送服务实现的 Node 版SDK。欢迎大家使用。


[小米推送](https://www.npmjs.com/package/push-xiaomi)

[魅族推送](https://www.npmjs.com/package/push-meizu)

[华为推送](https://www.npmjs.com/package/push-huawei)

[oppo推送](https://www.npmjs.com/package/push-oppo)

[iOS推送](https://www.npmjs.com/package/push-ios)

[友盟推送](https://www.npmjs.com/package/push-umeng)

#
```
npm install push-vivo --save-dev
```

## 实例
```javascript
const Vivo = require('push-vivo');
const vivo = new Vivo({
  appKey: 'appKey',
  appMasterSecret: 'appMasterSecret',
});

// 文件推送
vivo.push({
  title: '标题',
  content: '内容',
  list: ['vivo regId'], 
  success(response){}, // 成功回调
  fail(error){}, // 失败回调
  finish(result){},
});
```

## new Vivo()

| key | - | value |
|:----|:----|:----|
|appId| 必填： 请在Vivo管理中心查看| |
|appKey| 必填： 请在Vivo管理中心查看| |
|appSecret|必填： 请在Vivo管理中心查看| |
|pushUrl| | 批量推送URL 默认 https://api-push.vivo.com.cn/message/pushToList |
|pushSingleUrl| | 单个用户推送URL 默认 https://api-push.vivo.com.cn/message/send |
|maxLength| | push推送限制长度（此为文件播限制长度）默认50000 |


[Vivo服务端API接口文档](https://dev.vivo.com.cn/documentCenter/doc/155)