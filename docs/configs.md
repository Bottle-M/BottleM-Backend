# 相关配置

## 简述

本项目的配置文件全放在`configs`目录下：

* `api_configs.json` - 主配置文件
* `secret_configs.json` - 用于存放敏感信息(secrets)的配置文件
* `status_codes.json` - 状态码对应的信息的配置文件
* `user_tokens.json` - 用户访问令牌的配置文件

接下来分几节简述一下这几个配置文件。

## api_configs.json

这个配置是**本项目**的核心配置，牵涉到主控端与实例端。

```js
{
    "api_port": 2333, // HTTP API服务监听的端口
    "ws_port": 2334, // 日志WebSocket服务(用于传输Minecraft服务器日志)监听的端口
    "ws_ping_timeout": 20000, // 日志WebSocket连接的ping超时时间，用于判断连接是否死亡
    "logs_dir": "./api_logs", // 本项目日志的存放目录
    "rows_per_log": 200, // 每个日志文件最多储存的行数
    "max_logs_retained": 30, // 最多保留的**旧**日志文件数量
    "qcloud": { // 腾讯云API相关配置(取决于模块qcloud.js)
        // (用于筛选实例)待申请的实例的地域
        "region": "ap-chengdu", 
        // (用于筛选实例)实例族的正则表达式（反斜杠\要转义，比如表达\，需要使用\\）
        "instance_family_regex": "^SA?\\d$", 
        // (用于筛选实例)待申请实例的CPU核数
        "instance_cpu": 2,
        // (用于筛选实例)待申请实例的内存大小，单位为GB
        "instance_memory": 4,
        // (用于筛选实例)待申请实例的**内网**带宽的**最小值**，单位为Gbps
        "instance_bandwidth": 1,
        // (用于筛选实例)待申请实例的价格区间，单位为CNY元
        "hour_price_range": [0, 0.2],
        // 腾讯云项目ID（十分重要！）
        "project_id": 1275260,
        // 腾讯云镜像ID，用于启动实例，建议是自制镜像
        "image_id": "img-rhstpokr",
        // 待创建实例的系统盘配置，可以留system_disk:null，会默认分配系统盘
        "system_disk": {
            // 系统盘类型（详见腾讯云文档）
            "disk_type": "CLOUD_SSD",
            // 系统盘大小，单位为GB
            "disk_size": 50
        },
        // 实例绑定的私有网络配置
        // 全部留DEFAULT，即为默认私网
        "vpc": {
            // 私有网络的ID
            "vpc_id": "DEFAULT",
            // 子网的ID
            "subnet_id": "DEFAULT"
        },
        // 实例最大出网带宽，单位为Mbps
        "max_bandwidth_out": 5,
        // 实例绑定的安全组id
        "security_group_id": "sg-c76uww9x",
        // 实例主机名
        "host_name": "bottlem",
        // 最高竞价出价，单位为CNY元
        "max_spot_price": 0.3
    },
    // 新建实例后，等待实例进入RUNNING(运行中)状态的最大时间，单位为毫秒
    "instance_run_timeout": 90000,
    // 每次建立SSH连接失败后重试的次数
    "ssh_connect_retry": 3,
    // 建立SSH连接时的超时时间，单位为毫秒
    "ssh_ready_timeout": 20000,
    // 保持SSH连接的心跳间隔，单位为毫秒
    "ssh_keep_alive_interval": 8000,
    // 部署实例端InsSide的脚本，位于./scripts目录下
    "instance_deploy_sh": "set_up_base.sh",
    // 每次连接实例端WebSocket失败时重试的次数
    "instance_ws_connect_retry": 3,
    // 主控端临时用户访问令牌的配置
    "tokens": {
        // 令牌的有效期，单位为毫秒
        "default_validity": 720000,
        // 最大允许有多少个临时令牌
        "max_temp_tokens_num": 200,
        // 临时令牌拥有的权限节点
        "temp_permissions": [
            "server.normal.launch",
            "server.query.mc"
        ]
    },
    // 实例端InsSide的配置
    "ins_side": {
        // 实例端WebSocket服务监听的端口
        "ws_port": 9527,
        // 连接实例端WebSocket的超时时间，单位为毫秒
        "ws_ping_timeout": 20000,
        // 部署脚本和基本配置文件在实例端的存放目录
        // 必须是绝对路径
        "data_dir": "/root/baseData",
        // 部署Minecraft服务器的脚本，位于主控端./scripts目录下
        "deploy_scripts": [
            "setup_cos.sh",
            "get_server.sh"
        ],
        // 启动Minecraft服务器的脚本，位于主控端./scripts目录下
        "launch_script": "launch_server.sh",
        // Minecraft服务器相关的脚本，位于主控端./scripts目录下
        "server_scripts": {
            // 检查Minecraft服务器Java进程是否存在的脚本
            "check_process": "check_process.sh",
            // 检查竞价实例是否即将被腾讯云回收的脚本
            "check_termination": "check_termination.sh"
        },
        // 增量备份相关的配置
        "incremental_backup": {
            // 是否开启增量备份（建议是开启）
            "enable": true,
            // 增量备份的间隔时间，单位为毫秒
            "interval": 600000,
            // 增量备份在实例端的存放目录
            // 必须是绝对路径
            "dest_dir": "/root/increments",
            // 增量备份相关脚本，位于主控端./scripts目录下
            "scripts": {
                // 上传增量备份的脚本
                "backup": "incre_backup.sh",
                // 下载增量备份的脚本
                "restore": "incre_restore.sh",
                // 抛弃增量备份的脚本
                "discard": "incre_discard.sh"
            },
            // 增量备份针对的目录
            // 必须是绝对路径
            "src_dirs": [
                "/root/minecraft/world",
                "/root/minecraft/world_nether",
                "/root/minecraft/world_the_end"
            ]
        },
        // Minecraft服务器关闭后操作的相关脚本，位于主控端./scripts目录下
        "server_ending_scripts": {
            // 对Minecraft服务端进行打包的脚本
            "pack": "compress_and_pack.sh",
            // 上传打包后的文件的脚本
            "upload": "upload_server.sh"
        },
        // RCON配置，RCON用于控制Minecraft服务器
        "rcon": {
            // Minecraft服务器的rcon端口
            "port": 25575,
            // Minecraft服务器的rcon密码
            "password": "123456"
        },
        // Minecraft服务器最新日志文件的绝对路径，用于监视
        "mc_server_log": "/root/minecraft/logs/latest.log",
        // Minecraft服务器文件压缩包所在目录，无论是刚刚开始部署的解包，还是服务器关闭后的打包，都是在这个目录内进行的，另外程序可能还会扫描该目录内压缩包总大小，在服务器关闭打包后进行比对
        // 必须是绝对路径
        "packed_server_dir": "/root/serverPacked",
        // Minecraft服务端所在目录
        "mc_server_dir": "/root/minecraft",
        // 上述所有脚本执行时的工作目录(Working Directory)
        "script_exec_dir": "/root",
        // 等待Minecraft服务器启动的超时时间，单位为毫秒
        "mc_server_launch_timeout": 90000,
        // Minecraft处于无人状态下的最长空闲时间，单位为毫秒
        "server_idling_timeout": 900000,
        // 有玩家登入后，是否重置上述空闲时间
        "player_login_reset_timeout": true,
        // 最后上传压缩包前检查的压缩包大小一定要大于 **最初部署服务器时的压缩包大小** 的百分之多少
        "check_packed_server_size": 90
    }
}
```

注释中已经写清了配置项各自的作用，接下来提一些值得注意的地方。

### 环境变量

除了`instance_deploy_sh`配置项的脚本外，其他脚本**都有环境变量**。

* **公共环境变量**

    所有`instance_deploy_sh`外的脚本都有以下环境变量：

    | 环境变量名 | 内容 |
    |:---:|:---:|
    |`DATA_DIR`|同`ins_side`配置中的`data_dir`，代表实例端的数据目录，所有的Shell脚本和配置文件都存在这个目录中|
    |`PACK_DIR`|同`ins_side`配置中的`packed_server_dir`，代表Minecraft压缩包存放的目录|
    |`MC_DIR`|同`ins_side`配置中的`mc_server_dir`，代表Minecraft服务端所在的目录|
    |`TIMESTAMP`|执行脚本时的**毫秒级**时间戳|

* ```qcloud.js```**模块定义的环境变量**

    | 环境变量名 | 内容 |
    |:---:|:---:|
    |`QCLOUD_SECRET_ID`|腾讯云API密钥ID|
    |`QCLOUD_SECRET_KEY`|腾讯云API密钥KEY|

* 增量备份`incremental_backup`配置中的脚本的**共有**环境变量

    | 环境变量名 | 内容 |
    |:---:|:---:|
    |`BACKUP_DEST_DIR`|增量备份的文件的存放目录|
    |`RESTORE_DEST_DIR`|增量备份还原的文件的存放目录|

* 增量备份配置的`backup`和`restore`脚本中的**特有**环境变量

    | 环境变量名 | 内容 |
    |:---:|:---:|
    |`BACKUP_NAME`|当前新建/还原的增量备份的**文件名**，不包括扩展名|

* 增量备份配置的`discard`脚本中的**特有**环境变量:

    | 环境变量名 | 内容 |
    |:---:|:---:|
    |`BACKUP_NAME_LIST`|当前要删除的增量备份的**文件名**列表(空格分隔)，不包括扩展名|