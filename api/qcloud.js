// 实例相关操作的模块
'use strict';
const qcloudCvm = require('tencentcloud-sdk-nodejs-cvm');
const CvmClient = qcloudCvm.cvm.v20170312.Client;
const path = require('path');
const configs = require('../basic/config-box');
const outputer = require('../basic/output');
// 记录待删除密匙对，防止撞车
const deletingKeyPairs = new Object();
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
        "KeyName": `for_minecraft_${Math.round(Math.random() * 100)}`,
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
 * 查询密匙对信息
 * @param {String} keyId 
 * @returns {Promise} resolve一个对象,包含查询的密匙对的信息
 */
function describeKey(keyId) {
    let params = {
        "KeyIds": [
            keyId
        ]
    };
    return client.DescribeKeyPairs(params).then(
        (data) => {
            let keyInfo = data['KeyPairSet'][0];
            if (!keyInfo) {
                // 查无此密匙对
                return Promise.reject(`KeyPair ${keyId} not Found`);
            }
            return Promise.resolve(keyInfo);
        },
        (err) => {
            return Promise.reject(`Error occurred while querying Key Pair: ${err}`);
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

/**
 * 耐心地等待删除密匙对
 * @param {String} keyId 
 * @returns {Promise}
 * @note 因为和实例绑定的密匙对无法立即删除，可以利用这个函数将密匙ID加入等待队列 !!! 另外，有实例在创建的时候也不能删除密匙对！
 */
function elasticDelKey(keyId) {
    if (deletingKeyPairs[keyId]) // 密匙对正在等待删除
        return Promise.resolve('The key pair is under deletion');
    // 加入删除等待队列
    outputer(1, `Added key ${keyId} to the waiting list of deletion.`);
    deletingKeyPairs[keyId] = new Date().getTime();
    let timer = null;
    return new Promise((resolve, reject) => {
        timer = setInterval(() => {
            describeInstance().then(insSets => {
                // 保证当前所有实例都不在“创建中”状态
                // 不然可能触发腾讯云的BUG
                let allCreated = insSets.every(insInfo => {
                    return !(['PENDING', 'TERMINATING'].includes(insInfo['InstanceState']));
                });
                if (allCreated) {
                    clearInterval(timer);
                    return resolve('done');
                }
            })
        }, 5000);
    }).then(res => {
        return new Promise((resolve, reject) => {
            // 因为和实例绑定的Key是无法被删除的，这里需要等待Key和实例解绑
            timer = setInterval(() => {
                describeKey(keyId).then(keySet => {
                    if (keySet['AssociatedInstanceIds'].length <= 0) {
                        // 没有实例和该密匙对绑定，可以删除了
                        return Promise.resolve(keyId);
                    } else {
                        return Promise.reject(null);
                    }
                }).then(keyId => {
                    // 正式删除密匙对
                    return deleteKey(keyId).then(res => {
                        delete deletingKeyPairs[keyId]; // 从对象中移除待删除
                        clearInterval(timer); // 删除计时器
                        resolve('success');
                    })
                }).catch(err => {
                    if (err) { // 不处理null错误
                        delete deletingKeyPairs[keyId]; // 从对象中移除待删除
                        clearInterval(timer); // 删除计时器
                        reject(`Error occured while waiting to delete key ${keyId}: ${err}`);
                    }
                })
            }, 5000);
        });
    });
}

/**
 * 创建实例（登陆方式：密匙对）
 * @param {Array} insConfigs 实例配置数组，由filterInsType得来
 * @param {String} keyId 密匙对ID
 * @returns {Promise} 返回Promise对象
 * @note 创建实例时会从insConfigs最后一个配置开始尝试，直到创建实例成功为止。当insConfigs为空数组时，创建实例失败
 */
function createInstance(insConfigs, keyId) {
    if (insConfigs.length == 0) {
        // 所有配置文件都不能用，创建实例大失败！
        return Promise.reject('Unable to Create Instance due to invalid configs.');
    }
    let currentConfig = insConfigs.pop(),
        params = {
            "InstanceChargeType": "SPOTPAID",
            "Placement": {
                "Zone": currentConfig['Zone'],
                "ProjectId": qcloudConfigs['project_id']
            },
            "InstanceType": currentConfig['InstanceType'],
            "ImageId": qcloudConfigs['image_id'],
            "SystemDisk": {
                "DiskType": qcloudConfigs['system_disk']['disk_type'],
                "DiskSize": qcloudConfigs['system_disk']['disk_size']
            },
            "VirtualPrivateCloud": {
                "VpcId": qcloudConfigs['vpc']['vpc_id'],
                "SubnetId": qcloudConfigs['vpc']['subnet_id']
            },
            "InternetAccessible": {
                "InternetChargeType": "TRAFFIC_POSTPAID_BY_HOUR",
                "InternetMaxBandwidthOut": qcloudConfigs['max_bandwidth_out'],
                "PublicIpAssigned": true
            },
            "InstanceName": "Minecraft",
            "LoginSettings": {
                "KeyIds": [
                    keyId
                ]
            },
            "SecurityGroupIds": [
                qcloudConfigs['security_group_id']
            ],
            "HostName": qcloudConfigs['host_name'],
            "InstanceMarketOptions": {
                "MarketType": "spot",
                "SpotOptions": {
                    "MaxPrice": qcloudConfigs['max_spot_price'].toString(), // 这里要求的竟然是字符串类型
                    "SpotInstanceType": "one-time"
                }
            },
            "DryRun": false, // 测试用
            "DisableApiTermination": false // 允许API销毁实例
        };
    return client.RunInstances(params).then(
        (data) => {
            let instances = data['InstanceIdSet'];
            if (!instances) {
                console.log(`[DEBUG]${data}`);
            } else {
                // 返回创建的实例的ID
                return Promise.resolve(instances[0]);
            }
        },
        (err) => {
            // 无法创建实例就递归，继续尝试下一个配置
            outputer(2, `Error occurred while creating instance: ${err}, retrying...`);
            return createInstance(insConfigs, keyId);
        }
    );
}

/**
 * 退还实例
 * @param {String} insId 实例ID 
 * @returns {Promise}
 */
function terminateInstance(insId) {
    let params = {
        "InstanceIds": [
            insId
        ]
    };
    return client.TerminateInstances(params).then(
        (data) => {
            return Promise.resolve('done');
        },
        (err) => {
            return Promise.reject(`Failed to terminate instance: ${err}`);
        }
    );
}

/**
 * 查询实例状态信息
 * @param {String} insId 
 * @returns {Promise} resolve一个对象，包含查询的实例的信息
 * @note 如果没有传入insId，则返回InstanceSet
 */
function describeInstance(insId = '') {
    let params = insId ? {
        "InstanceIds": [
            insId
        ]
    } : {};
    return client.DescribeInstances(params).then(
        (data) => {
            if (insId) {
                let insInfo = data['InstanceSet'][0];
                if (!insInfo) {
                    // 返回的数据中没有实例信息，说明实例不存在
                    return Promise.reject(`Instance ${insId} not found.`);
                }
                // 返回实例信息
                return Promise.resolve(insInfo);
            } else {
                return Promise.resolve(data['InstanceSet']);
            }
        },
        (err) => {
            return Promise.reject(`Error occurred while describing instance: ${err}`);
        }
    );
}

module.exports = {
    filterInsType: filterInsType,
    generateKey: generateKey,
    deleteKey: deleteKey,
    createInstance: createInstance,
    describeInstance: describeInstance,
    terminateInstance: terminateInstance,
    describeKey: describeKey,
    elasticDelKey: elasticDelKey
}