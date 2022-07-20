// 实例相关操作的模块
'use strict';
const qcloudCvm = require('tencentcloud-sdk-nodejs-cvm');
const CvmClient = qcloudCvm.cvm.v20170312.Client;
const path = require('path');
const configs = require(path.join(__dirname, '../basic/config-box'));
// 获得腾讯云相关Secret配置
const qcloudSecret = configs['secretConfigs']['qcloud'];