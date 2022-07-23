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
 * 请求API以获得实例列表，并根据配置和正则表达式进行筛选
 * @returns {Promise<void>} 返回Promise对象
 */
function filterInsType() {
    let params = {
        "Filters": [
            {
                "Name": "instance-charge-type",
                "Values": [
                    // 查询竞价实例
                    "SPOTPAID"
                ]
            }
        ]
    },
        // 获得正则表达式
        regex = new RegExp(qcloudConfigs['instance_family_regex']),
        cpuSpecified = qcloudConfigs['instance_cpu'],
        memSpecified = qcloudConfigs['instance_memory'],
        bandSpecified = qcloudConfigs['instance_bandwidth'],
        priceRange = qcloudConfigs['hour_price_range'];
    return client.DescribeZoneInstanceConfigInfos(params).then(
        (data) => {
            let resultArr = data['InstanceTypeQuotaSet'],
                filteredTypes = [];
            // 先按实例family筛选出来部分实例类型
            for (let i = 0, len = resultArr.length; i < len; i++) {
                let item = resultArr[i];
                if (regex.test(item['InstanceFamily'])) {
                    filteredTypes.push(item);
                }
            }
            // 再按实例CPU和内存筛选
            filteredTypes = filteredTypes.filter((item) => {
                let priceInfo = item['Price'],
                    discountPrice = priceInfo['UnitPriceDiscount'];
                return (item['InstanceBandwidth'] >= bandSpecified) && // 内网带宽要满足最小值
                    (item['Status'] == 'SELL') && // 起码要有货
                    (priceInfo['ChargeUnit'] == 'HOUR') && // 按小时计费
                    (discountPrice >= priceRange[0]) && // 在价格区间内
                    (discountPrice <= priceRange[1]) &&
                    (item['Cpu'] == cpuSpecified) && // 指定CPU核数
                    (item['Memory'] == memSpecified); // 指定内存大小
                /*
                    InstancePps=0的情况：
                    SA1 实例规格列表中，网络收发包一列的“-”表示该规格无固定的网络收发包与处理器主频性能承诺。如对性能一致性有强诉求，建议选购有性能承诺的机型。
                    来自 https://cloud.tencent.com/document/product/213/11518
                */
            });
            return Promise.resolve(filteredTypes);
        },
        (err) => {
            return Promise.reject(`Error occurred while getting instance families: ${err}`);
        }
    );
}

/**
 * 生成实例登录密匙对
 * @returns {Promise} 返回Promise对象
 * @note resolve一个对象，包含两个属性：privateKey, keyId
 */
function generateKey() {
    let params = {
        "KeyName": "for_minecraft",
        "ProjectId": qcloudConfigs['project_id']
    };
    return client.CreateKeyPair(params).then(
        (data) => {
            return Promise.resolve({
                privateKey: data['KeyPair']['PrivateKey'],
                keyId: data['KeyPair']['KeyId']
            });
        },
        (err) => {
            return Promise.reject(`Error occurred while generating Key Pair: ${err}`);
        }
    );
}

/**
 * 删除实例登录密匙对
 * @param {*} keyId 密匙对ID
 * @returns {Promise} 返回Promise对象
 */
function deleteKey(keyId) {
    let params = {
        "KeyIds": [
            keyId
        ]
    };
    return client.DeleteKeyPairs(params).then(
        (data) => {
            return Promise.resolve(data);
        },
        (err) => {
            return Promise.reject(`Error occurred while deleting Key Pair: ${err}`);
        }
    );
}


module.exports = {
    filterInsType: filterInsType,
    generateKey: generateKey,
    deleteKey: deleteKey
}