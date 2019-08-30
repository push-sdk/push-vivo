const axios = require('axios');
const _ = require('lodash');
const crypto = require('crypto');

class Vivo {
  constructor(options = {}) {
    options.getTokenUrl = options.getTokenUrl || 'https://api-push.vivo.com.cn/message/auth';
    options.saveMessageUrl = options.saveMessageUrl || 'https://api-push.vivo.com.cn/message/saveListPayload';
    // 推单个用户时推送接口。
    options.pushSingleUrl = options.pushSingleUrl || 'https://api-push.vivo.com.cn/message/send';
    // 推2个及以上用户时推送接口。
    options.pushUrl = options.pushUrl || 'https://api-push.vivo.com.cn/message/pushToList';
    options.maxLength = options.maxLength || 1000;
    options.timeout = options.timeout || 300000;

    if (!options.appId) throw new Error('vivo appId 不能为空');
    if (!options.appKey) throw new Error('vivo appKey 不能为空');
    if (!options.appSecret) throw new Error('vivo appSecret 不能为空');
    if (!options.maxLength > 1000) throw new Error('vivo 批量推送maxLength 不能超过1000');

    this.options = options;
  }

  async sleep(time) {
    return new Promise((reslove) => {
      setTimeout(() => {
        reslove({});
      }, time);
    });
  }

  async push(data) {
    // 单个用户改为调用pushSingle.
    if(data.list.length <= 1) {
      return this.pushSingle(data);
    }

    let n = 0;
    let taskId = 0;
    let authToken = '';
    let success_total = 0;
    let fail_total = 0;
  
    let success = data.success || function () { };
    let fail = data.fail || function () { };
    let finish = data.finish || function () { };
    let sleep = data.sleep || 0;

    const regIdsGroup = _.chunk(data.list, this.options.maxLength);

    delete data.list;
    delete data.success;
    delete data.fail;
    delete data.finish;
    delete data.sleep;

    try {
      const tokenData = await this.getToken();

      if( tokenData.result != 0 ) {
        throw new Error(tokenData.desc);
      } else {
        authToken = tokenData.authToken;
      }

      let saveMessageParams = _.cloneDeep(data);
      delete saveMessageParams.list;

      const msgData = await this.saveMessage(saveMessageParams, authToken);

      taskId = msgData.taskId;
    } catch (err) {
      console.error(err);
      fail(err);
      finish({
        status: 'success',
        maxLength: this.options.maxLength,
        group: regIdsGroup.length,
        success_total,
        fail_total: data.list.length
      });
      return;
    }

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
          if(invalidUsers.length > 1 ) {
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
            fail_total
          });
        }
      });

      await this.sleep(sleep);
    }

  }

  async pushSingle(data) {
    let authToken = '';
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
      const tokenData = await this.getToken();

      if( tokenData.result != 0 ) {
        fail(tokenData.desc);
        fail_total = 1;
        throw new Error(tokenData.desc);
      } else {
        authToken = tokenData.authToken;
      }

      let params = _.cloneDeep(data);
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
        
        if (res.result == 0) {
          success(res);
          success_total = 1;
        } else {
          throw new Error(JSON.stringify(res));
        }
        return true;
      }).catch((err) => {
        fail_total = 1;
        fail(err);
        return false;
      });
    } catch (err) {
      console.error(err);
    }

    let result = {
      status: 'success',
      maxLength: this.options.maxLength,
      group: 1,
      success_total,
      fail_total,
    };
    finish(result);
    return result;
  }

  async saveMessage(data, authToken = '') {
    const params = _.merge({
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

  async getToken() {
    const timestamp = Date.now();
    let appId = this.options.appId;
    let appKey = this.options.appKey;
    let appSecret = this.options.appSecret;
    let sign = crypto.createHash('md5').update(`${appId}${appKey}${timestamp}${appSecret}`).digest('hex');

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

    return response.data;
  }

}

module.exports = Vivo;