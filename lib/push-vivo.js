const axios = require('axios');
const chunk = require('lodash/chunk');
const cloneDeep = require('lodash/cloneDeep');
const merge = require('lodash/merge');
const isString = require('lodash/isString');
const crypto = require('crypto');

class Vivo {
  constructor(options = {}) {
    options.getTokenUrl = options.getTokenUrl || 'https://api-push.vivo.com.cn/message/auth';
    options.saveMessageUrl = options.saveMessageUrl || 'https://api-push.vivo.com.cn/message/saveListPayload';
    // 推单个用户时推送接口。
    options.pushSingleUrl = options.pushSingleUrl || 'https://api-push.vivo.com.cn/message/send';
    // 推2个及以上用户时推送接口。
    options.pushUrl = options.pushUrl || 'https://api-push.vivo.com.cn/message/pushToList';
    // 全量用户推送接口。（每日1次）
    options.pushAllUrl = options.pushAllUrl || 'https://api-push.vivo.com.cn/message//all';
    // 获取消息推送的统计值接口。
    options.statisticUrl = options.statisticUrl || 'https://api-push.vivo.com.cn/report/getStatistics';
    options.statisticMaxNum = options.statisticMaxNum || 100;
    options.maxLength = options.maxLength || 1000;
    options.timeout = options.timeout || 300000;

    if (!options.appId) throw new Error('vivo appId 不能为空');
    if (!options.appKey) throw new Error('vivo appKey 不能为空');
    if (!options.appSecret) throw new Error('vivo appSecret 不能为空');
    if (!options.maxLength > 1000) throw new Error('vivo 批量推送maxLength 不能超过1000');
    if (!options.statisticMaxNum > 100) throw new Error('vivo 同时获取消息推送统计数量不能超过100');

    this.options = options;
    this.cacheTokens = {};
    this.cacheTime = 7200000; // 60*60*2*1000 = 7200000 ，2小时缓存。
    this.getStatistics = this.getStatistics.bind(this);
    this.setCacheToken = this.setCacheToken.bind(this);
  }

  async sleep(time) {
    return new Promise((reslove) => {
      setTimeout(() => {
        reslove({});
      }, time);
    });
  }

  async pushAll(data) {
    let authToken = '';
    let taskId = null;
    let success_total = 0;
    let fail_total = 0;
  
    let success = data.success || function () { };
    let fail = data.fail || function () { };
    let finish = data.finish || function () { };

    delete data.list;
    delete data.success;
    delete data.fail;
    delete data.finish;
    delete data.sleep;

    try {
      authToken = await this.getToken({ type: 'pushAll'});

      let params = cloneDeep(data);
      Object.assign(params, {
        requestId: Date.now()
      });

      await axios({
        url: this.options.pushAllUrl,
        method: 'POST',
        timeout: this.options.timeout,
        headers: {
          'content-type': 'application/json',
          'authToken' : authToken
        },
        data: params
      }).then(response => {
        const res = response.data;
        
        if (res.result != 0) {
          throw new Error(JSON.stringify(res));
        }

        taskId = res.taskId;
        success(res);
      });
    } catch (err) {
      // console.error(err);
      fail(err);
    }

    let result = {
      status: 'success',
      maxLength: this.options.maxLength,
      group: 1,
      success_total,
      fail_total,
      taskId,
      vivoTaskIdList: [taskId],
      tips: '通过厂商全量推，数据根据taskId查询。'
    };
    finish(result);
    return result;
  }

  async push(data) {
    // 单个用户改为调用pushSingle.
    if(data.list.length <= 1) {
      return this.pushSingle(data);
    }

    let n = 0;
    let taskId = null;
    let authToken = '';
    let success_total = 0;
    let fail_total = 0;
  
    let success = data.success || function () { };
    let fail = data.fail || function () { };
    let finish = data.finish || function () { };
    let sleep = data.sleep || 0;

    const regIdsGroup = chunk(data.list, this.options.maxLength);
    const totalRegIdNum = data.list.length;

    delete data.list;
    delete data.success;
    delete data.fail;
    delete data.finish;
    delete data.sleep;

    // 先保存数据。
    try {
      authToken = await this.getToken({ type: 'pushList'});

      let saveMessageParams = cloneDeep(data);
      delete saveMessageParams.list;
      const msgData = await this.saveMessage(saveMessageParams, authToken);

      if( msgData.result != 0 ) {
        throw new Error(JSON.stringify(msgData));
      }
      taskId = msgData.taskId;
    } catch (err) {
      // console.error(err);
      fail(err.toString());
      finish({
        status: 'success',
        maxLength: this.options.maxLength,
        group: regIdsGroup.length,
        success_total,
        fail_total: totalRegIdNum
      });
      return;
    }

    // 再分批推。
    for (const i in regIdsGroup) {
      let params = {
        taskId,
        regIds: regIdsGroup[i],
        requestId: Date.now()
      };
      axios({
        url: this.options.pushUrl,
        method: 'POST',
        timeout: this.options.timeout,
        headers: {
          'content-type': 'application/json',
          'authToken' : authToken
        },
        data: params
      }).then(response => {
        const res = response.data;
        
        if (res.result == 0) {
          success(res);
          let invalidUsers = res.invalidUsers;
          let invalidUsersNum = 0;
          // 统计非法用户
          if(invalidUsers.length > 0 ) {
            invalidUsersNum = invalidUsers.length;
            fail({invalidUsers});
          }
          fail_total += invalidUsersNum;
          success_total += regIdsGroup[i].length - invalidUsersNum;
        } else {
          throw new Error(JSON.stringify(res));
        }
        return true;
      }).catch((err) => {
        fail_total += regIdsGroup[i].length;
        fail(err);
        return false;
      }).then(() => {
        n++;
        if (n >= regIdsGroup.length) {
          finish({
            status: 'success',
            maxLength: this.options.maxLength,
            group: regIdsGroup.length,
            success_total,
            fail_total,
            taskId,
            vivoTaskIdList: [taskId],
          });
        }
      });

      await this.sleep(sleep);
    }

  }

  async pushSingle(data) {
    let authToken = '';
    let taskId = null;
    let success_total = 0;
    let fail_total = 0;
  
    let success = data.success || function () { };
    let fail = data.fail || function () { };
    let finish = data.finish || function () { };
    const regId = data.list[0];

    delete data.list;
    delete data.success;
    delete data.fail;
    delete data.finish;
    delete data.sleep;

    try {
      authToken = await this.getToken({ type: 'pushSingle'});

      let params = cloneDeep(data);
      Object.assign(params, {
        regId,
        requestId: Date.now()
      });

      await axios({
        url: this.options.pushSingleUrl,
        method: 'POST',
        timeout: this.options.timeout,
        headers: {
          'content-type': 'application/json',
          'authToken' : authToken
        },
        data: params
      }).then(response => {
        const res = response.data;
        
        if (res.result != 0) {
          throw new Error(JSON.stringify(res));
        }

        success_total = 1;
        taskId = res.taskId;
        success(res);

      });
    } catch (err) {
      // console.error(err);
      fail_total = 1;
      fail(err);
    }

    let result = {
      status: 'success',
      maxLength: this.options.maxLength,
      group: 1,
      success_total,
      fail_total,
      taskId,
      vivoTaskIdList: [taskId],
    };
    finish(result);
    return result;
  }

  async saveMessage(data, authToken = '') {
    const params = merge({
      requestId: Date.now()
    }, data);

    const response = await axios({
      url: this.options.saveMessageUrl,
      method: 'POST',
      timeout: this.options.timeout,
      data: params,
      headers: {
        'content-type': 'application/json',
        'authToken' : authToken
      }
    });
    return response.data;
  }

  async getToken ( {type} ) {
    if( !type ) {
      throw new Error('Function getToken 缺type参数');
    }

    if( this.cacheTokens[type] != null ) {
      return this.cacheTokens[type];
    }

    const timestamp = Date.now();
    let appId = this.options.appId;
    let appKey = this.options.appKey;
    let appSecret = this.options.appSecret;
    let sign = crypto.createHash('md5').update(`${appId}${appKey}${timestamp}${appSecret}`).digest('hex');
    let authToken;

    const response = await axios({
      url: this.options.getTokenUrl,
      method: 'POST',
      timeout: this.options.timeout,
      headers: {
        'content-type': 'application/json'
      },
      data: {
        appId,
        appKey,
        sign,
        timestamp
      }
    });

    let tokenData = response.data;
    if( tokenData.result != 0 ) {
      throw new Error(tokenData.desc);
    } else {
      authToken = tokenData.authToken;
      this.setCacheToken(authToken, type);
    }

    return authToken;
  }

  setCacheToken (authToken, type) {
    this.cacheTokens[type] = authToken;

    setTimeout(() => {
      this.cacheTokens[type] = null;
    }, this.cacheTime);
  }

  /**
   * @desc 获取消息推送的统计值接口，taskIds最多100个。
   * @param {Array|String} taskIds 
   * @returns {Object} res 
   *  // {
      //   "result":0,
      //   "desc":"请求成功",
      //   "statistics":[
      //   {
      //     "taskId":   "298475091219",
      //     "target": 10000,
      //     "valid": 9500,
      //     "send": 9000,
      //     "receive": 9000,
      //     "display": 8000,
      //     "click": 200,
      //     "targetInvalid":   200,
      //     "targetUnSub":   200,
      //     "targetInActive": 100,
      //     "covered": 200,
      //     "controlled":   200,
      //     "targetOffline":   100
      //    }
      //   ]
      // }
   */
  async getStatistics(taskIds) {
    let authToken;
    // 将数组转成字符串
    if (Array.isArray(taskIds)) {
      taskIds = taskIds.filter((id) => {
        return isString(id) && id.length > 0;
      });
      taskIds = taskIds.join(',');
    }

    if( !isString(taskIds) ) {
      return new Error('taskIds 不是数组或字符串');
    }

    authToken = await this.getToken({type: "statistic"});

    const res = await axios({
      url: this.options.statisticUrl,
      method: 'GET',
      timeout: this.options.timeout,
      headers: {
        'content-type': 'application/json',
        'authToken' : authToken
      },
      params: {
        taskIds: taskIds
      },
    }).then(response => {
      return response.data;
    });

    return res;
  }
}

module.exports = Vivo;