// 实例相关操作的模块
'use strict';
const qcloudCvm = require('tencentcloud-sdk-nodejs-cvm');
const CvmClient = qcloudCvm.cvm.v20170312.Client;
const { writeFileSync } = require('fs');
const configs = require('../basic/config-box');
const outputer = require('../basic/output');
// 记录待删除密匙对，防止撞车
const deletingKeyPairs = new Object();
// 设置EndPoint
const CVM_END_POINT = 'cvm.tencentcloudapi.com';
// 获得除了secret之外的配置
const QCLOUD_CONFIGS = configs['apiConfigs']['qcloud'];
// 获得腾讯云相关Secret配置
const QCLOUD_SECRETS = configs['secretConfigs']['qcloud'];
const CLIENT_CONFIGS = {
    credential: {
        secretId: QCLOUD_SECRETS['secretId'],
        secretKey: QCLOUD_SECRETS['secretKey'],
    },
    region: QCLOUD_CONFIGS['region'],
    profile: {
        httpProfile: {
            endpoint: CVM_END_POINT,
        },
    },
};
// 相关的环境变量
const ENVIRONMENT = {
    'QCLOUD_SECRET_ID': QCLOUD_SECRETS['secretId'],
    'QCLOUD_SECRET_KEY': QCLOUD_SECRETS['secretKey']
};

const client = new CvmClient(CLIENT_CONFIGS);

/**
 * 请求API以获得实例列表，并根据配置和正则表达式进行筛选
 * @param {String} outputPath 输出路径(输出未筛选的实例列表)
 * @returns {Promise} 返回Promise对象
 * @note 最后的输出按权重从大到小排序
 * @note 计算权重数：先把折扣价*1000，减去内网带宽*20。数值越小，权重越大
 */
function filterInsType(outputPath = '') {
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
        regex = new RegExp(QCLOUD_CONFIGS['instance_family_regex']),
        cpuSpecified = QCLOUD_CONFIGS['instance_cpu'],
        memSpecified = QCLOUD_CONFIGS['instance_memory'],
        bandSpecified = QCLOUD_CONFIGS['instance_bandwidth'],
        priceRange = QCLOUD_CONFIGS['hour_price_range'];
    return client.DescribeZoneInstanceConfigInfos(params).then(
        (data) => {
            let resultArr = data['InstanceTypeQuotaSet'],
                filteredTypes = [];
            // 将未筛选的实例列表输出到指定路径，以便后期检查
            if (outputPath) {
                writeFileSync(outputPath, JSON.stringify(resultArr, null, 4));
            }
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
            filteredTypes.sort((former, latter) => { // 根据价格、内网带宽进行排序
                // 计算权重数：先把折扣价*1000，减去内网带宽*20。数值越小，权重越大
                let formerWeight = former['Price']['UnitPriceDiscount'] * 1000 - former['InstanceBandwidth'] * 20,
                    latterWeight = latter['Price']['UnitPriceDiscount'] * 1000 - latter['InstanceBandwidth'] * 20;
                return latterWeight - formerWeight; // 降序，这样后面直接pop就行
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
        "ProjectId": QCLOUD_CONFIGS['project_id']
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
 * @param {String} keyId 密匙对ID
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
            }).catch(err => {
                reject(err);
            })
        }, 5000);
    }).then(res => {
        return new Promise((resolve, reject) => {
            // 因为和实例绑定的Key是无法被删除的，这里需要等待Key和实例解绑
            timer = setInterval(() => {
                describeKey(keyId).then(keySet => {
                    if (keySet['AssociatedInstanceIds'].length <= 0) {
                        // 没有实例和该密匙对绑定，可以删除了
                        clearInterval(timer); // 删除计时器
                        return Promise.resolve(keyId);
                    } else {
                        return Promise.reject(null);
                    }
                }).then(keyId => {
                    // 正式删除密匙对
                    return deleteKey(keyId).then(res => {
                        delete deletingKeyPairs[keyId]; // 从对象中移除待删除
                        resolve('success');
                    })
                }).catch(err => {
                    if (err)// 不处理null错误
                        reject(err);
                })
            }, 5000);
        });
    }).catch(err => {
        clearInterval(timer);
        delete deletingKeyPairs[keyId]; // 从对象中移除待删除
        return Promise.reject(`Error occured while waiting to delete key ${keyId}: ${err}`);
    })
}

/**
 * 创建实例（登陆方式：密匙对）
 * @param {Array} insConfigs 实例配置数组，由filterInsType得来
 * @param {String} keyId 密匙对ID
 * @returns {Promise} 返回Promise对象, resolve内容为实例ID
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
                "ProjectId": QCLOUD_CONFIGS['project_id']
            },
            "InstanceType": currentConfig['InstanceType'],
            "ImageId": QCLOUD_CONFIGS['image_id'],
            "SystemDisk": {
                "DiskType": QCLOUD_CONFIGS['system_disk']['disk_type'],
                "DiskSize": QCLOUD_CONFIGS['system_disk']['disk_size']
            },
            "VirtualPrivateCloud": {
                "VpcId": QCLOUD_CONFIGS['vpc']['vpc_id'],
                "SubnetId": QCLOUD_CONFIGS['vpc']['subnet_id']
            },
            "InternetAccessible": {
                "InternetChargeType": "TRAFFIC_POSTPAID_BY_HOUR",
                "InternetMaxBandwidthOut": QCLOUD_CONFIGS['max_bandwidth_out'],
                "PublicIpAssigned": true
            },
            "InstanceName": "Minecraft",
            "LoginSettings": {
                "KeyIds": [
                    keyId
                ]
            },
            "SecurityGroupIds": [
                QCLOUD_CONFIGS['security_group_id']
            ],
            "HostName": QCLOUD_CONFIGS['host_name'],
            "InstanceMarketOptions": {
                "MarketType": "spot",
                "SpotOptions": {
                    "MaxPrice": QCLOUD_CONFIGS['max_spot_price'].toString(), // 这里要求的竟然是字符串类型
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
 * @param {String|Array} insId 实例ID（可以是单个字符串，也可以是数组）
 * @returns {Promise}
 */
function terminateInstance(insId) {
    if (!(insId instanceof Array)) insId = [insId];
    let params = {
        "InstanceIds": insId
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
    let params = {
        "Filters": [
            {
                "Name": "project-id",
                "Values": [
                    // 筛选出当前项目的实例
                    // 似乎Filters中的Integer字段还是要转换成字符串才有用。
                    String(QCLOUD_CONFIGS['project_id'])
                ]
            }
        ]
    };
    if (insId) {
        // 腾讯云API不支持InstanceIds字段和Filters同时存在，所以全部要用Filters解决
        params['Filters'].push({
            "Name": "instance-id",
            "Values": [
                insId
            ]
        });
    }
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

/**
 * 检查实例是否已经启动
 * @param {String} insId 待检查的实例ID
 * @returns {Promise<Object>} resolve一个对象，包含两个属性：running(boolean)和ip(string) 
 * @note 如果获取IP地址失败会reject
 * @note 实质调用的是describeInstance
 */
function checkInstanceState(insId) {
    const resObj = {
        running: false,
        ip: ''
    };
    return describeInstance(insId).then(insInfo => {
        if (insInfo['InstanceState'] === 'RUNNING') {
            //  实例已经启动，可以进行连接
            let pubIp = insInfo['PublicIpAddresses'][0];
            if (!pubIp) {
                // 实例没有绑定公网IP，reject
                return Promise.reject('No public ip address');
            }
            resObj.running = true;
            resObj.ip = pubIp;
            return Promise.resolve(resObj);
        } else {
            return Promise.resolve(resObj);
        }
    })
}

module.exports = {
    environment: ENVIRONMENT,
    filterInsType,
    generateKey,
    deleteKey,
    createInstance,
    describeInstance,
    checkInstanceState,
    terminateInstance,
    describeKey,
    elasticDelKey,
}