// 实例相关操作的模块
'use strict';
const qcloudCvm = require('tencentcloud-sdk-nodejs-cvm');
const CvmClient = qcloudCvm.cvm.v20170312.Client;
const path = require('path');
const configs = require('../basic/config-box');
// 设置EndPoint
const cvmEndPoint = 'cvm.tencentcloudapi.com';
// 获得除了secret之外的配置
const qcloudConfigs = configs['apiConfigs']['qcloud'];
// 获得腾讯云相关Secret配置
const qcloudSecret = configs['secretConfigs']['qcloud'];
const clientConfig = {
    credential: {
        secretId: qcloudSecret['secretId'],
        secretKey: qcloudSecret['secretKey'],
    },
    region: qcloudConfigs['region'],
    profile: {
        httpProfile: {
            endpoint: cvmEndPoint,
        },
    },
};

const client = new CvmClient(clientConfig);

/**
 * 请求API以获得实例族列表，并根据配置的正则表达式进行筛选
 * @returns {Promise<void>} 返回Promise对象
 */
function filterInsFamily() {
    // 获得正则表达式
    let regex = new RegExp(qcloudConfigs['instance_family_regex']);
    return client.DescribeInstanceFamilyConfigs().then(
        (data) => {
            let resultArr = data['InstanceFamilyConfigSet'],
                filteredFamily = []; // 储存筛选出来的实例族
            for (let i = 0, len = resultArr.length; i < len; i++) {
                let currentFamily = resultArr[i]['InstanceFamily'];
                if (regex.test(currentFamily)) {
                    filteredFamily.push(currentFamily);
                }
            }
            return Promise.resolve(filteredFamily);
        },
        (err) => {
            return Promise.reject(`Error occurred while getting instance families: ${err}`);
        }
    );
}

module.exports = {
    filterFamily: filterInsFamily
}