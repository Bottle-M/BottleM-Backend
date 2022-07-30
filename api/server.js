// 服务器相关API
'use strict';
const fs = require('fs');
const ascFs = fs.promises;
const path = require('path');
const configs = require('../basic/config-box');
const apiConfigs = configs['apiConfigs'];
const cloud = require('./qcloud');
const outputer = require('../basic/output');
const utils = require('./server-utils');
// launch.lock这个文件存在则代表服务器已经部署
const lockFilePath = configs['launchLockFile'];
// login.pem，服务器登录密匙文件
const keyFilePath = configs['loginKeyFile'];
// instance_details实例详细信息文件路径
const insDetailsFilePath = configs['insDetailsFile'];
// 所有Shell脚本所在目录
const localScriptsDir = path.join(__dirname, '../scripts/');
// 所有必要数据上传到实例中的哪里（绝对路径）
const remoteDir = configs['remoteDir'];
// 实例端部署脚本的绝对路径（务必写成绝对路径）
const insDeployScriptPath = utils.toPosixSep(
    path.join(remoteDir, apiConfigs['instance_side_sh'])
);


/**
 * 比价，然后创建实例
 * @return {Promise} resolve创建的实例ID
 * @note 这是第一个环节
 */
function compareAndRun() {
    let statusCode = utils.getStatus('status_code');
    // 这里用于resume，在进程重启后能恢复到上回的进度
    if (statusCode > 2000) { // 上次意外终止时状态并不是Idling或者出现错误
        let details = utils.getInsDetail() || [],
            keyId = details['instance_key_id'],
            insId = details['instance_id'];
        if (statusCode >= 2100) { // 上次终止时进入了下一阶段，直接resolve
            return insId ? Promise.resolve(insId) : Promise.reject('No instance ID found, unable to resume');
        } else { // 上次终止时仍然在进行创建密匙对/实例工作
            outputer(1, 'Cleaning remains of the incomplete deployment.');
            // 如果密匙对已经创建，就销毁密匙对
            if (keyId) {
                cloud.elasticDelKey(keyId).then(res => {
                    outputer(1, `Key ${keyId} was deleted.`);
                }).catch(err => {
                    outputer(2, err);
                });
                // 如果密匙对已经创建，十有八九有一个失去控制的实例，这里也需要进行清除
                utils.terminateOOCIns().then(res => {
                    outputer(1, `Out-of-control Instances were terminated.`);
                }).catch(err => {
                    outputer(2, err);
                });
            }
            // 实例已经创建，就销毁实例
            if (insId)
                cloud.terminateInstance(insId).then(res => {
                    outputer(1, `Instance ${insId} was terminated.`);
                }).catch(err => {
                    outputer(2, `Failed to terminate instance ${insId}: ${err}`);
                });
            // 删除实例临时文件
            utils.cleanServerTemp();
            // 恢复状态为idling
            utils.setStatus(2000);
            // resume部分为达到中止效果，需要reject null
            // null是不作处理的
            return Promise.reject(null);
        }
    }
    // 以下开始是正常的创建实例流程
    utils.setStatus(2001); // 开始比价
    return cloud.filterInsType().then(insConfigs => {
        insConfigs.sort((former, latter) => { // 根据价格、内网带宽进行排序
            // 计算权重数：先把折扣价*1000，减去内网带宽*20。数值越小，权重越大
            let formerWeight = former['Price']['UnitPriceDiscount'] * 1000 - former['InstanceBandwidth'] * 20,
                latterWeight = latter['Price']['UnitPriceDiscount'] * 1000 - latter['InstanceBandwidth'] * 20;
            return latterWeight - formerWeight; // 降序，这样后面直接pop就行
        });
        if (insConfigs.length <= 0) {
            // 如果没有可用实例，设置状态码为2000，触发错误1000
            return utils.setStatus(2000).then(res => {
                // 没有可用的实例
                return Promise.reject('No available instance (that meet the specified configuration)');
            }); // 同样是rejected留给外面处理
        }
        return Promise.resolve(insConfigs);
        // rejected留给外面处理
    }).then(insConfigs => {
        utils.setStatus(2002); // 生成密匙对
        return cloud.generateKey().then(keyObj => {
            let keyId = keyObj['keyId'];
            // 写入密钥文件
            return ascFs.writeFile(keyFilePath, keyObj['privateKey'], {
                encoding: 'utf8'
            }).then(res => {
                let detailedData = {
                    instance_key_id: keyId
                };
                // 将密匙ID写入instanceDetail文件
                return ascFs.writeFile(insDetailsFilePath, JSON.stringify(detailedData), {
                    encoding: 'utf8'
                })
            }).then(res => {
                // 把keyId传下去，在创建实例的时候可以直接绑定
                return Promise.resolve([insConfigs, keyId]);
            })
        });
    }).then(configsAndKey => {
        utils.setStatus(2003); // 创建实例
        let [insConfigs, keyId] = configsAndKey;
        return cloud.createInstance(insConfigs, keyId)
            .then(insId => {
                return utils.setInsDetail('instance_id', insId)
                    .then(res => {
                        return Promise.resolve(insId); // 将实例ID传入下一个环节
                    });
            });
    });
}

/**
 * 建立“基地”（在创建的实例上）
 * @param {string} insId 实例ID
 * @return {Promise} 
 * @note 这是第二个环节
 */
function setUpBase(insId) {
    let statusCode = utils.getStatus('status_code'),
        timer = null,
        alreadyWaitFor = 0, // 已经等待了多久（毫秒）
        queryInterval = 5000, // 每5秒查询一次
        sshConn = null; // 保存ssh连接
    // 此部分用于resume
    if (statusCode >= 2200) {
        // 如果状态码大于等于2200，说明已经进入第三阶段
        return Promise.resolve('done');
    }
    return new Promise((res, rej) => {
        utils.setStatus(2100); // 等待实例开始运行
        timer = setInterval(() => {
            // 每5秒查询一次服务器是否已经启动
            cloud.describeInstance(insId).then(insInfo => {
                //  实例已经启动，可以进行连接
                if (insInfo['InstanceState'] === 'RUNNING') {
                    // 清理计时器（这里不用finally是因为后续请求执行完前不会执行finally中的代码）
                    clearInterval(timer);
                    let pubIp = insInfo['PublicIpAddresses'][0];
                    if (!pubIp) {
                        return Promise.reject('No public ip address');
                    }
                    // 将公网IP写入instance_details
                    return utils.setInsDetail('instance_ip', pubIp)
                        .then(success => {
                            return Promise.resolve(pubIp);
                        });
                } else {
                    return Promise.resolve('');
                }
            }).then(pubIp => {
                if (pubIp) // 如果得到了公网IP，就可以进行连接
                    res(pubIp);
            }).catch(err => {
                clearInterval(timer);
                rej(`Error occured while querying the instance: ${err}`);
            });
            alreadyWaitFor += queryInterval;
            if (alreadyWaitFor >= apiConfigs['instance_run_timeout']) {
                // 等待超时，实例仍然没有启动，肯定出现了问题
                clearInterval(timer);
                rej(`Instance is not going to run: ${err}`);
            }
        }, queryInterval);
    }).then((pubIp) => {
        utils.setStatus(2101); // 尝试通过SSH连接实例
        return utils.connectInsSSH(pubIp).then(conn => {
            outputer(1, 'Successfully connected to the instance.');
            return Promise.resolve(conn);
        });
    }).then((sshConn) => {
        utils.setStatus(2102); // 开始部署实例上的“基地”
        // 先创建实例端配置临时文件
        let [insTempConfigPath, insTempConfigName] = utils.makeInsSideConfig();
        // 通过sftp传输部署脚本
        return ascFs.readdir(localScriptsDir).then(fileArr => {
            // 将scripts目录下所有文件名和目录绝对路径连起来
            fileArr = fileArr.map((file) =>
                [
                    path.join(localScriptsDir, file),
                    path.join(remoteDir, file)
                ]
            );
            // 把实例端临时配置文件也加入传输队列
            fileArr.push([
                insTempConfigPath,
                utils.toPosixSep(
                    path.join(remoteDir, insTempConfigName)
                )
            ]);
            return utils.fastPutFiles(sshConn, fileArr, remoteDir)
                .then(success => {
                    outputer(1, 'Successfully delivered.');
                    return Promise.resolve(sshConn);
                })
        }).catch(err => {
            return Promise.reject(`Failed to deliver the Deploy Scripts: ${err}`);
        });
    }).then((sshConn) => {
        utils.setStatus(2103); // 开始执行实例端部署脚本
        return new Promise((res, rej) => {
            sshConn.exec(`${insDeployScriptPath}`, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    if (code === 0) {
                        outputer(1, 'Successfully deployed.');
                        res('done');
                    } else {
                        rej(`Deploy Failed, code:${code}, signal:${signal}`);
                    }
                }).on('error', (err) => {
                    rej(`Deploy Failed Due to Stream Error: ${err}`);
                }).on('data', (data) => {
                    console.log('SHELL STDOUT: ' + data);
                }).stderr.on('data', (data) => {
                    rej(`Deploy Script Error: ${data}`);
                });
            });
        });
    }).finally(() => {
        // 最后关闭ssh客户端连接
        if (sshConn)
            sshConn.end();
    });
}

/**
 * 通过WebSocket和实例端进行连接，进行后续流程
 * @return {Promise} 
 * @note 这是第三个环节
 */
function insSideMonitor() {
    utils.setStatus(2200); // 尝试连接实例端
    console.log('resume to monitor');
    return utils.connectInsSide().then((ws) => {
        console.log('WS CONNECTED.');
        ws.on('message', (msg) => {
            console.log('received:'+msg);
            ws.send('HEY THERE!');   
        });
    });
}

/**
 * 启动入口，单独写出来主要是为了resume的时候可以直接调用
 */
function launchEntry() {
    compareAndRun() // 交由异步函数处理
        .then(insId => {
            // 开始在实例上建设“基地”
            return setUpBase(insId);
        })
        .then(res => {
            return insSideMonitor();
        })
        .catch(err => {
            if (err) {
                // 必须要有错误信息才当错误处理
                utils.errorHandler(err);
            }
        });
}

module.exports = {
    /**
     * 部署/启动服务器（会检查服务器是否已经启动）
     * @param {*} resultObj 返回数据对象
     * @returns 装有返回数据的对象
     */
    launch: function (resultObj) {
        // 检查状态文件，取不到文件默认1000
        let statusCode = utils.getStatus('status_code') || 1000;
        if (Math.floor(statusCode / 1000) == 1) {
            // 出现了错误，阻止服务器启动
            resultObj.msg = 'Error exists, unable to launch the server';
        } else {
            try {
                // 检查是否有launch.lock文件
                fs.statSync(lockFilePath);
                resultObj.msg = 'Server Already Launched';
            } catch (e) {
                // 创建launch.lock文件
                utils.elasticWrite(lockFilePath, `Launched at ${new Date().toISOString()}`);
                launchEntry();
                resultObj.msg = 'Starting to deploy the server!';
                resultObj.code = 0; // 0 代表交由异步处理
            }
        }
        return resultObj;
    },
    /**
     * 进程意外重启之后依靠resume函数重新进入流程
     */
    resume: launchEntry
}