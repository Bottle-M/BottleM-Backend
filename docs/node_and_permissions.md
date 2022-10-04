# 节点及其权限

## 目录

- [主节点](#主节点)
- [server](#server)
    - [normal](#node-normal) `正常地....`
        - [launch](#normal-launch) `部署Minecraft服务器`
        - [restore_and_launch](#normal-restore_and_launch) `恢复增量备份并部署Minecraft服务器`
        - [launch_and_discard_backup](#normal-launch_and_discard_backup) `抛弃增量备份并部署Minecraft服务器`
    - [maintenance](#node-maintenance) `维护模式下...`
        - [launch](#maintenance-launch) `部署Minecraft服务器`
        - [stop](#maintenance-stop) `停止Minecraft服务器`
        - [kill](#maintenance-kill) `强制停止Minecraft服务器`
        - [get_key](#maintenance-get_key) `获得privateKey`
        - [revive](#maintenance-revive) `尝试恢复主控端运行`
        - [wipe_butt](#maintenance-wipe_butt) `强制清理，让主控端恢复正常`
        - [restore_and_launch](#maintenance-restore_and_launch) `恢复增量备份并部署Minecraft服务器`
        - [launch_and_discard_backup](#maintenance-launch_and_discard_backup) `抛弃增量备份并部署Minecraft服务器`
        - [关于维护模式](#about-maintenance)
    - [command](#node-command) 
        - [send](#command-send) `向Minecraft服务器发送命令`
    - [mc_logs](#node-mc_logs)
        - [get](#mc_logs-get) `获取Minecraft服务器日志`
    - [query](#node-query) `查询......`
        - [mc](#query-mc) `Minecraft服务器状态信息`
        - [backend](#query-backend) `主控端状态信息`
- [backend](#backend)
    - [token](#node-token)
        - [generate](#token-generate) `生成临时token`
- [websocket](#websocket) `实例端WebSocket广播...`
    - [mclog](#node-mclog) `Minecraft服务器日志`
        - [receive](#mclog-receive) `是否能接收到`
- [权限节点](#权限节点)
    - [通配符](#通配符)

## 主节点

主控端一共有三个主节点：

* `server` - (HTTP API支持) 对实例和Minecraft服务器的操作节点

* `backend` - (HTTP API支持) 对主控端的操作节点

* `websocket` - (仅限主控端WebSocket) 传输Minecraft服务器日志的节点

## server

server节点下有一些子节点：

<a id="node-normal"></a>

* `normal` - 普通情况下的服务器部署操作节点

    该节点下的操作：

    <a id="normal-launch"></a>

    * `launch` - 正常申请实例并部署Minecraft服务器

        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）：
        
            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Starting to deploy the server!"
            }
            ```
    
    <a id="normal-restore_and_launch"></a>

    * `restore_and_launch` - 正常申请实例，在实例启动后**尝试恢复增量备份**（如果有的话），然后部署Minecraft服务器

        - 请求方法：`GET`
        - 返回示例: 同[`launch`](#normal-launch)

    <a id="normal-launch_and_discard_backup"></a>

    * `launch_and_discard_backup` - 正常申请实例，**抛弃已有的增量备份**，然后部署Minecraft服务器

        - 请求方法：`GET`
        - 返回示例: 同[`launch`](#normal-launch)

    > 如果没有增量备份或者配置中未启动增量备份，`restore_and_launch`和`launch_and_discard_backup`的行为和`launch`一致

<a id="node-maintenance"></a>

* `maintenance` - 服务器维护相关的操作的节点

    <a id="maintenance-launch"></a>

    * `launch` - 正常申请实例并**在维护模式下**部署Minecraft服务器

        - 请求方法：`GET`
        - 返回示例: 同[`launch`](#normal-launch)

    <a id="maintenance-stop"></a>

    * `stop` - 软停止Minecraft服务器，并送回实例
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）: 
        
            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Closing the server..."
            }
            ```

    <a id="maintenance-kill"></a>

    * `kill` - 强制停止Minecraft服务器，并送回实例
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）: 
        
            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Killing the server..."
            }
            ```

    <a id="maintenance-get_key"></a>

    * `get_key` - 获取通过SSH连接当前实例所需的privateKey
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）: 
        
            ```json
            {
                "data": {
                    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
                },
                "code": 1,
                "msg": "Please take care of it."
            }
            ```

    <a id="maintenance-revive"></a>

    * `revive` - 清除**主控端**当前的错误（如果有错误的话），尝试**从上次发生错误的地方**继续运行  
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）：

            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Reviving..."
            }
            ```

        > 注：仅用于一些偶发性错误，比如等待实例启动超时，但实例后来又正常启动了。

    <a id="maintenance-wipe_butt"></a>

    * `wipe_butt` - “擦屁股”。主要功能是**直接送回实例**，清除Minecraft服务器相关数据，并清除主控端的错误，回到`2000`状态。
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）：

            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Resources were terminated."
            }
            ```

        > 注：相对来说这是**很危险**的操作，仅在`revive`无法清除错误的情况下使用！

    <a id="maintenance-restore_and_launch"></a>

    * `restore_and_launch` - 正常申请实例，在实例启动后**尝试恢复增量备份**（如果有的话），然后**在维护模式下**部署Minecraft服务器
    
        - 请求方法：`GET`
        - 返回示例: 同[`launch`](#normal-launch)

    <a id="maintenance-launch_and_discard_backup"></a>

    * `launch_and_discard_backup` - 正常申请实例，**抛弃已有的增量备份**，然后**在维护模式下**部署Minecraft服务器
    
        - 请求方法：`GET`
        - 返回示例: 同[`launch`](#normal-launch)

    ------

    <a id="about-maintenance"></a>

    关于**维护模式**：

    1. 维护模式下实例端不会对Minecraft服务器进行监视，无论Minecraft服务器进程存在与否，实例都会持续运行下去。

    2. 维护模式下**在实例端**不会检查竞价实例是否即将被回收，但是这并不影响**主控端**这边的检查。

    3. 维护模式下，无论Minecraft服务器有没有玩家，都不会被自动停止（没有倒计时）。

    4. 综上，维护模式下，你只能通过`stop` / `kill`这些节点操作来停止Minecraft服务器并送回实例。

    -------

<a id="node-command"></a>

* `command` - Minecraft服务器命令节点

    <a id="command-send"></a>

    * `send` - 向Minecraft服务器发送命令
    
        - 请求方法：`POST`
        - 请求体示例（`Content-Type: application/json`）：

            ```js
            {
                // command项为发给Minecraft服务器的命令
                "command": "say Hello World."
            }
            ```

        - 返回示例（`Content-Type: application/json`）：

            ```json
            {
                "data": {},
                "code": 0,
                "msg": "Successfully sent the command"
            }
            ```

<a id="node-mc_logs"></a>

* `mc_logs` - Minecraft服务器日志节点

    <a id="mc_logs-get"></a>

    * `get` - 获取Minecraft服务器日志(`latest.log`)
    
        - 请求方法：`GET`
        - 返回示例：
            - 如果成功：`Content-Type: text/plain`

                ```text
                [19:00:45] [Server thread/INFO]: Starting remote control listener
                [19:00:45] [Server thread/INFO]: Thread RCON Listener started
                [19:00:45] [Server thread/INFO]: RCON running on 0.0.0.0:25575
                [19:00:45] [Server thread/INFO]: Running delayed init tasks
                [19:00:45] [Server thread/INFO]: [GroupManager] [STDOUT] [GroupManager] Bukkit 的权限更新了！
                [19:00:45] [Server thread/INFO]: Done (2.852s)! For help, type "help"
                [19:00:45] [Server thread/INFO]: Timings Reset
                ```

            - 不成功：`Content-Type: application/json`

                ```json
                {
                    "data": {},
                    "code": -1,
                    "msg": "Lack of valid action"
                }
                ```

            

<a id="node-query"></a>

* `query` - 状态查询节点

    <a id="query-mc"></a>

    * `mc` - 获取Minecraft服务器的状态信息
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）：

            ```js
            {
                "data": {
                    // Minecraft服务器的IP地址
                    "ip": "129.28.91.200", 
                    // 上次主控端连接到实例端的时间
                    "connect_time": 1664881227510, 
                    // 剩余的空闲时间（秒），始终为0说明是维护模式，没有倒计时
                    "idling_time_left": 0, 
                    // 当前在线玩家数
                    "players_online": 0,
                    // Minecraft配置的总玩家数
                    "players_max": 20
                },
                "code": 1,
                "msg": "Success."
            }
            ```

    <a id="query-backend"></a>
    
    * `backend` - 获取主控端(backend)的状态信息
    
        - 请求方法：`GET`
        - 返回示例（`Content-Type: application/json`）：

            ```js
            {
                "data": {
                    // 当前主控端的状态信息
                    "status_msg": "Server deployed successfully!",
                    // 当前主控端的状态码
                    "status_code": 2300,
                    // 主控端上一次发生的错误的相关信息
                    "last_err": "Fatal:Failed to restore dir: /root/increments/restore/root-minecraft-activity_world",
                    // 主控端上一次发生错误的时间
                    "last_err_time": "2022/9/24 16:32:00",
                    // 上一次错误的来源，insside - 实例端，backend - 主控端
                    "err_from": "insside"
                },
                "code": 1,
                "msg": "Success."
            }
            ```

## backend

backend节点下目前只有一个子节点：

<a id="node-token"></a>

* `token` - 主控端访问令牌节点

    <a id="token-generate"></a>

    * `generate` - 生成一个**用于游客访问**的临时令牌
    
        - 请求方法：`POST`

    > 注：相关配置在[`api_configs.json`](configs.md#api_configsjson)的`tokens`配置项中。

## websocket

websocket节点下目前只有一个子节点：

<a id="node-mclog"></a>

* `mclog` - Minecraft服务器日志节点

    <a id="mclog-receive"></a>

    * `receive` - 接收Minecraft服务器日志

## 权限节点

实际上将上面的**节点和操作**串联起来，就构成了一个权限节点。

比如：

* **在非维护模式下部署服务器**的权限节点：

    ```
    server.normal.launch
    ```

* **正常关闭Minecraft服务器**的权限节点：

    ```
    server.maintenance.stop
    ```

* **向Minecraft服务器发送命令**的权限节点：

    ```
    server.command.send
    ```

### 通配符

权限节点中支持通配符`*`，使用例如下：

* 给予令牌对应的用户**所有`server`节点的权限**：

    ```
    server.*
    ```

* 给予令牌对应的用户**所有`server`节点下的`maintenance`子节点的权限**：

    ```
    server.maintenance.*
    ```

* 给予令牌对应的用户**所有`server`节点下的`launch`操作的权限**：

    ```
    server.*.launch
    ```
