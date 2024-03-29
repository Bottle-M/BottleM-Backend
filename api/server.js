// 服务器相关API
'use strict';
const fs = require('fs');
const ascFs = fs.promises;
const path = require('path');
const cloud = require('./qcloud');
const outputer = require('../basic/output');
const tools = require('../basic/tools');
const utils = require('./server-utils');
const wsHandler = require('./ws-handler');
const configs = require('../basic/config-box');
// 导入服务器事件Emitter
const { ServerEvents } = require('../basic/events');
const API_CONFIGS = configs['apiConfigs'];
// launch.lock这个文件存在则代表服务器已经部署
const LOCK_FILE_PATH = configs['launchLockPath'];
// login.pem，服务器登录密匙文件
const LOGIN_KEY_FILE_PATH = configs['loginKeyPath'];
// instance_details实例详细信息文件路径
const INS_DETAILS_FILE_PATH = configs['insDetailsPath'];
// 所有Shell脚本所在目录
const LOCAL_SCRIPTS_DIR = path.join(__dirname, '../scripts/');
// 所有必要数据上传到实例中的哪里（绝对路径）
// 即实例部署的数据目录
const INS_DATA_DIR = configs['insDataDir'];
// 实例端部署脚本的绝对路径（务必写成绝对路径）
const INS_DEPLOY_SCRIPT_PATH = utils.toPosixSep(
    path.join(INS_DATA_DIR, API_CONFIGS['instance_deploy_sh'])
);

class Server {
    constructor() {
        this._maintain = false; // 默认不是维护模式
        this._restore = false; // 默认不对增量备份(如果有的话)进行任何操作
        this._cleaningUp = false; // 是否正在清理(防止cleanDeploy重复执行)
        this._instanceIp = ''; // 临时记录实例IP
    }
    /**
     * 比价，然后创建实例
     * @return {Promise} resolve创建的实例ID
     * @note 这是第一个环节
     */
    compareAndRun() {
        // 这里用于resume，在进程重启后能恢复到上回的进度
        if (this._initialStatusCode > 2000) { // 上次意外终止时状态并不是Idling或者出现错误
            let insId = utils.getInsDetail('instance_id');
            if (this._initialStatusCode >= 2100) { // 上次终止时进入了下一阶段，直接resolve
                return insId ? Promise.resolve(insId) : Promise.reject('No instance ID found, unable to resume');
            } else { // 上次终止时仍然在进行创建密匙对/实例工作
                return this.cleanDeploy().then(success => {
                    if (success)
                        // cleanDeploy成功的情况下恢复状态为idling
                        utils.setStatus(2000);
                    // resume部分为达到中止Promise链的效果，需要reject null
                    // null是不作处理的
                    return Promise.reject(null);
                }).catch(err => {
                    // 这里是真出问题了
                    return Promise.reject(err);
                });
            }
        }
        // 以下开始是正常的创建实例流程
        utils.setStatus(2001); // 开始比价
        // 可用实例列表（未经筛选）的输出路径，用于检查
        const outputPath = path.join(__dirname, `../${configs['serverTempDir']}/all_available_ins.json`);
        return cloud.filterInsType(outputPath).then(insConfigs => {
            if (insConfigs.length <= 0) {
                // 如果没有可用实例，设置状态码为2000，触发错误1000
                utils.setStatus(2000);
                return Promise.reject('No available instance (that meet the specified configuration)');
            }
            return Promise.resolve(insConfigs);
            // rejected留给外面处理
        }).then(insConfigs => {
            utils.setStatus(2002); // 生成密匙对
            return cloud.generateKey().then(keyObj => {
                let keyId = keyObj.keyId;
                // 写入密钥文件
                return ascFs.writeFile(LOGIN_KEY_FILE_PATH, keyObj.privateKey, {
                    encoding: 'utf8'
                }).then(res => {
                    let detailedData = {
                        instance_key_id: keyId
                    };
                    // 将密匙ID写入instanceDetail文件
                    return ascFs.writeFile(INS_DETAILS_FILE_PATH, JSON.stringify(detailedData), {
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
                    utils.setInsDetail('instance_id', insId)
                    return Promise.resolve(insId); // 将实例ID传入下一个环节
                });
        });
    }
    /**
     * 建立“基地”（在创建的实例上）
     * @param {string} insId 实例ID
     * @return {Promise} 
     * @note 这是第二个环节
     */
    setUpBase(insId) {
        let timer = null,
            alreadyWaitFor = 0, // 已经等待了多久（毫秒）
            queryInterval = 5000, // 每5秒查询一次
            sshConn = null, // 保存ssh连接
            that = this;
        // 此部分用于resume
        if (this._initialStatusCode >= 2200) {
            // 如果状态码大于等于2200，说明已经进入第三阶段
            return Promise.resolve('done');
        }
        return new Promise((resolve, reject) => {
            utils.setStatus(2100); // 等待实例开始运行
            timer = setInterval(() => {
                // 每5秒查询一次服务器是否已经启动
                cloud.checkInstanceState(insId).then(insObj => {
                    const { running, ip } = insObj;
                    if (running) {
                        // 服务器已经启动
                        // 清理计时器
                        clearInterval(timer);
                        // 将公网IP写入instance_details
                        utils.setInsDetail('instance_ip', ip);
                        // 继续流程
                        resolve(ip);
                    }
                }).catch(err => {
                    clearInterval(timer);
                    reject(`Error occured while querying the instance: ${err}`);
                });
                alreadyWaitFor += queryInterval;
                if (alreadyWaitFor >= API_CONFIGS['instance_run_timeout']) {
                    // 等待超时，实例仍然没有启动，肯定出现了问题
                    clearInterval(timer);
                    reject(`Instance is not going to run: timeout`);
                }
            }, queryInterval);
        }).then((pubIp) => {
            utils.setStatus(2101); // 尝试通过SSH连接实例
            return utils.connectInsSSH(pubIp).then(conn => {
                outputer(1, 'Successfully connected to the instance.');
                that._instanceIp = pubIp; // 记录实例IP
                // 触发事件getip
                ServerEvents.emit('getip', pubIp);
                return Promise.resolve(conn);
            });
        }).then((sshConn) => {
            utils.setStatus(2102); // 开始部署实例上的“基地”
            // 先创建实例端配置临时文件
            let [insTempConfigPath, insTempConfigName] = utils.makeInsSideConfig({
                // 将部署配置(是否是维护模式,是否要恢复增量备份)写入实例端配置文件
                'under_maintenance': this._maintain,
                'restore_before_launch': this._restore,
                'backup_records': utils.readBackupRecs() // 读取备份记录，如果没有会返回null
            });
            // 通过sftp传输部署脚本
            return ascFs.readdir(LOCAL_SCRIPTS_DIR).then(fileArr => {
                // 将scripts目录下所有文件名和目录绝对路径连起来
                fileArr = fileArr.map((file) =>
                    [
                        path.join(LOCAL_SCRIPTS_DIR, file),
                        path.join(INS_DATA_DIR, file)
                    ]
                );
                // 把实例端临时配置文件也加入传输队列
                fileArr.push([
                    insTempConfigPath,
                    utils.toPosixSep(
                        path.join(INS_DATA_DIR, insTempConfigName)
                    )
                ]);
                // 检查并创建remoteDir目录
                return utils.createMultiDirs(INS_DATA_DIR)
                    .then(success => {
                        return utils.fastPutFiles(sshConn, fileArr);
                    })
                    .then(success => {
                        outputer(1, 'Successfully delivered.');
                        return Promise.resolve(sshConn);
                    });
            }).catch(err => {
                return Promise.reject(`Failed to deliver the Deploy Scripts: ${err}`);
            });
        }).then((sshConn) => {
            utils.setStatus(2103); // 开始执行实例端部署脚本
            return new Promise((res, rej) => {
                sshConn.exec(`${INS_DEPLOY_SCRIPT_PATH}`, (err, stream) => {
                    if (err) {
                        rej(err);
                        return;
                    }
                    stream.on('close', (code, signal) => {
                        if (code === 0) {
                            outputer(1, 'Successfully deployed.');
                            // 记录Minecraft服务器IP
                            utils.setMCInfo('ip', that._instanceIp);
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
    insSideMonitor() {
        let that = this,
            // 获得实例ID
            instanceId = utils.getInsDetail('instance_id'),
            // 用于检查竞价实例是否即将被回收的计时器
            terminatePoller = null;
        utils.setStatus(2200); // 尝试连接实例端
        utils.setMCInfo([
            'connect_time', // 记录连接时间
            'idling_time_left', // 初始化剩余空闲时间
            'players_online', // 初始化在线玩家数
            'players_max' // 初始化最大玩家数
        ], [
            Date.now(),
            0,
            0,
            0
        ]); // 创建Minecraft服务器信息文件
        return utils.connectInsSide().then((ws) => {
            return new Promise((resolve, reject) => {
                let cleanWS = (ws) => {
                    utils.wsTimerClear.call(ws); // 清空心跳监听计时器
                    wsHandler.revokeWS(); // 设置主连接为null
                    ws.terminate(); // 中止连接
                }; // 清理WebSocket残留的函数，在断开连接后使用
                // 轮询检查实例是否被回收
                terminatePoller = setInterval(() => {
                    cloud.checkTermination(instanceId).then((facingTermination) => {
                        if (facingTermination) {
                            // 竞价实例即将被回收！
                            // 通知实例端紧急停服
                            wsHandler.send(utils.buildWSReq('urgent_stop'));
                            // 清除计时器
                            clearInterval(terminatePoller);
                        }
                    });
                }, 5000);
                outputer(1, 'WebSocket Connected.');
                // 擦屁股(释放实例等资源)时，要退出monitor
                ServerEvents.once('stopmonitor', () => {
                    console.log('Monitor stopped.');
                    cleanWS(ws);
                    reject(null); // reject一个null，不会触发errorHandler
                });
                // 请求同步状态，实例端状态从2201开始
                ws.send(utils.buildWSReq('status_sync'));
                ws.on('message', (msg) => {
                    // 传来的数据不能为空
                    if (!(/^\s*$/.test(msg))) {
                        let parsed = JSON.parse(msg);
                        wsHandler.router(parsed, ws);
                    }
                })
                    .on('ping', utils.wsHeartBeat.bind(ws)) // 心跳监听
                    .on('close', (code, reason) => { // 断开连接
                        outputer(1, `WebSocket Connection Closed: ${code}, Reason:${reason}`);
                        cleanWS(ws); // 清理工作
                        if (code == 1001)
                            resolve(false); // 正常关闭，不再重连
                        else
                            resolve(true); // 这里true代表尝试重新连接
                    })
                    .on('error', (err) => {
                        outputer(3, `WebSocket Error: ${err}`);
                    });
            }).finally(() => {
                // 移除所有擦屁股事件监听器
                ServerEvents.removeAllListeners('stopmonitor');
                // 移除竞价实例待回收检查器
                clearInterval(terminatePoller);
            })
        }).then(reconnect => {
            if (reconnect) {
                // 普通的连接中断，(3秒后)尝试重连一下
                // 这里一定得返回一个Promise对象
                return new Promise((res) => {
                    setTimeout(res, 3000);
                }).then(res => {
                    return that.insSideMonitor();
                });
            } else {
                // 实例端退出，服务器流程走完，退出monitor
                return Promise.resolve('InsSide passed away, see you!');
            }
        }).catch(err => {
            // 如果是擦屁股，会reject一个null，不会触发errorHandler，这里也直接reject，不进行重试
            if (!err) {
                return Promise.reject(err);
            }
            // 实在无法连接到实例端，说明实例端死亡了
            // 退出monitor
            outputer(2, `${err}, good bye...`);
            return Promise.resolve('Oops, InsSide died...');
        });
    }
    /**
     * 一次流程走完，清理这次部署的残余内容
     * @return {Promise} resolve一个Bool，代表是否成功
     * @note 不成功的情况往往是已经正在cleanDeploy
     * @note 发生重大错误时仍然会reject
     * @note 这是最后一个环节
     */
    cleanDeploy() {
        if (this._cleaningUp)
            return Promise.resolve(false);
        this._instanceIp = ''; // 清空缓存的实例IP
        this._cleaningUp = true; // 标记正在清理中
        let details = utils.getInsDetail() || [],
            keyId = details['instance_key_id'],
            insId = details['instance_id'],
            that = this;
        outputer(1, 'Cleaning the remains of the deployment.');
        let cleanTasks = []; // 清理任务Promises
        // 如果密匙对已经创建，就销毁密匙对
        if (keyId) {
            cleanTasks.push(
                cloud.elasticDelKey(keyId).then(res => {
                    outputer(1, `Key ${keyId} was deleted.`);
                }).catch(err => {
                    // 容错处理，可能存在已经被删除的情况
                    outputer(2, `Key ${keyId} was not deleted: ${err}`);
                    return Promise.resolve();
                }),
                // 如果密匙对已经创建，可能有失去控制的实例，这里也需要进行清除
                utils.terminateOOCIns().then(res => {
                    outputer(1, `Out-of-control Instances were terminated.`);
                })
            );
        }
        // 实例已经创建，就销毁实例
        if (insId)
            cleanTasks.push(
                cloud.terminateInstance(insId).then(res => {
                    outputer(1, `Instance ${insId} was terminated.`);
                }).catch(err => {
                    // 容错处理，可能存在已经被删除的情况
                    outputer(2, `Instance ${insId} was not terminated: ${err}`);
                    return Promise.resolve();
                })
            );
        // 保证所有清理任务都执行完毕
        return Promise.all(cleanTasks).then(res => {
            // 删除实例临时文件
            utils.clearServerTemp();
            return Promise.resolve(true);
        }).catch(err => {
            return Promise.reject(`Failed to clean remains: ${err}`);
        }).finally(() => {
            that._cleaningUp = false; // 标记不在清理中
        });
    }
    /**
     * 启动入口，单独写出来主要是为了resume的时候可以直接调用
     * @param {Boolean} maintain 是否在维护模式下启动
     * @param {Boolean|String} restore 是否恢复(true)/抛弃(discard)增量备份后启动服务器
     */
    entry(maintain, restore) {
        let that = this;
        // 更新选项
        this._maintain = maintain;
        this._restore = restore;
        // 获得执行entry时的statusCode，用以resume
        this._initialStatusCode = utils.getStatus('status_code');
        this.compareAndRun() // 交由异步函数处理
            .then(insId => that.setUpBase(insId)) // 开始在实例上建设“基地”
            .then(res => that.insSideMonitor())
            .then(res => {
                utils.setStatus(2500);
                return that.cleanDeploy();
            })
            .then(success => {
                // 这个地方流程进行完了，cleanDeploy成不成功都不影响流程，所以不需要判断，直接设置状态码为2000
                // 恢复状态为idling
                utils.setStatus(2000);
            })
            .catch(err => {
                if (err) {
                    // 必须要有错误信息才当错误处理(err=null时不处理)
                    utils.errorHandler(err);
                }
            });
    }
}

// 创建Server的实例
const ServerDeploy = new Server();

module.exports = {
    /**
     * 尝试清除当前错误状态，恢复正常（有可能失败）
     * @param {Object} resultObj 返回给路由的数据对象
     * @returns {Object} 装有返回数据的对象
     * @note 这个方法主要用于偶发性错误
     */
    revive: function (resultObj) {
        // 检查状态文件，取不到文件默认1000
        let {
            status_code: statusCode,
            err_from: errFrom // 错误来源
        } = utils.getStatus(),
            that = this;
        // 状态码<2000，说明出现了错误，可以尝试revive  
        if (statusCode && statusCode < 2000) {
            if (errFrom === 'insside') // 是来自实例端的错误, 对症下药
                wsHandler.send(utils.buildWSReq('revive')); // 向实例端发送revive信号
            // 加上1000就是原来的状态码
            utils.setStatus(statusCode + 1000);
            // 如果是来自主控端的错误
            if (errFrom === 'backend')
                that.resume(); // 尝试恢复
            resultObj.msg = 'Reviving...';
            resultObj.code = 0; // 0 代表交由异步处理
        } else {
            resultObj.msg = 'There\'s no need to revive.';
        }
        return resultObj;
    },
    /**
     * 在Minecraft服务器内执行命令
     * @param {String} cmd 要执行的命令
     * @param {Object} resultObj 返回给路由的数据对象
     * @returns {Object} 装有返回数据的对象
     * @note 如果服务器尚未开启，待执行的指令会被缓存起来，等服务器开启后再执行
     */
    sendCommand: function (cmd, resultObj) {
        // 检查状态文件，取不到文件默认1000
        let statusCode = utils.getStatus('status_code') || 1000;
        if (statusCode >= 2300 && statusCode < 2400) {
            // 状态代码在[2300,2400)区间中，说明服务器已经启动
            wsHandler.send(utils.buildWSReq('command', {
                command: cmd
            }));
            resultObj.code = 0; // 0 代表交由异步处理
        } else {
            // 其余情况服务器没有启动，将指令缓存起来
            utils.storeCommand(cmd);
            resultObj.code = 1; // 1 代表成功
        }
        resultObj.msg = 'Successfully sent the command';
        return resultObj;
    },
    /**
     * 向Minecraft服务器发送stop指令
     * @param {Boolean} force 是否强制停止(kill)
     * @param {Object} resultObj 返回给路由的数据对象
     * @returns {Object} 装有返回数据的对象
     */
    stop: function (force, resultObj) {
        let statusCode = utils.getStatus('status_code') || 1000;
        if (statusCode >= 2300 && statusCode < 2400) {
            // 状态代码在[2300,2400)区间中，说明服务器已经启动
            if (force) {
                wsHandler.send(utils.buildWSReq('kill'));
                resultObj.msg = 'Killing the server...';
            } else {
                wsHandler.send(utils.buildWSReq('stop'));
                resultObj.msg = 'Closing the server...';
            }
            resultObj.code = 0; // 0 代表交由异步处理
        } else {
            resultObj.msg = 'Server is not running.'; // Minecraft不在运行
        }
    },
    /**
     * 部署/启动服务器（会检查服务器是否已经启动）
     * @param {Boolean} maintain 是否在维护模式下启动
     * @param {Boolean|String} restore 是否恢复(true)/抛弃(discard)增量备份后启动服务器
     * @param {Object} resultObj 返回给路由的数据对象
     * @returns {Object} 装有返回数据的对象
     * @note 如果restore='discard'，会在启动服务器后丢弃增量备份
     */
    launch: function (maintain, restore, resultObj) {
        // 检查状态文件，取不到文件默认1000
        let statusCode = utils.getStatus('status_code') || 1000;
        if (Math.floor(statusCode / 1000) === 1) {
            // 出现了错误，阻止服务器启动
            resultObj.msg = 'Error exists, unable to launch the server';
        } else {
            try {
                // 检查是否有launch.lock文件
                fs.statSync(LOCK_FILE_PATH);
                resultObj.msg = 'Server Already Launched';
            } catch (e) {
                if (utils.backupExists() && !restore) {
                    // 存在增量备份，这说明上次实例端没有正常退出
                    resultObj.msg = 'Urgent backup exists, please use action: restore_and_launch or launch_and_discard_backup';
                } else {
                    // 创建launch.lock文件
                    tools.elasticWrite(LOCK_FILE_PATH, `Launched at ${new Date().toISOString()}`);
                    ServerDeploy.entry(maintain, restore);
                    resultObj.msg = 'Starting to deploy the server!';
                    resultObj.code = 0; // 0 代表交由异步处理
                }
            }
        }
        return resultObj;
    },
    /**
     * 在revive都没办法的情况下，可以利用wipe_butt直接退还实例等资源(擦屁股方法)
     */
    wipeButt: () => {
        ServerEvents.emit('stopmonitor'); // 停止monitor，防止清理的时候还保持着Websocket连接
        ServerDeploy.cleanDeploy()
            .then(success => {
                if (success)
                    // 成功了就恢复到初始状态
                    utils.setStatus(2000);
            }).catch(err => {
                utils.errorHandler(`Failed to terminate resources:${err}`);
            })
    },
    /**
     * 进程意外重启之后依靠resume函数重新进入流程
     */
    resume: () => {
        // 这样写是为了保证entry方法的this指向实例ServerDeploy
        ServerDeploy.entry();
    }
}