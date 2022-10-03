# 节点及其权限

主控端一共有三个主节点：

* `server` - (HTTP API支持) 对实例和Minecraft服务器的操作节点

* `backend` - (HTTP API支持) 对主控端的操作节点

* `websocket` - (仅限主控端WebSocket) 传输Minecraft服务器日志的节点

## server

server节点下有一些子节点：

* `normal` - 普通情况下的服务器部署操作节点

    该节点下的操作：

    * `launch` - 正常申请实例并部署Minecraft服务器
    
    * `restore_and_launch` - 正常申请实例，在实例启动后**尝试恢复增量备份**（如果有的话），然后部署Minecraft服务器

    * `launch_and_discard_backup` - 正常申请实例，**抛弃已有的增量备份**，然后部署Minecraft服务器

    > 如果没有增量备份或者配置中未启动增量备份，`restore_and_launch`和`launch_and_discard_backup`的行为和`launch`一致

* `maintenance` - 服务器维护相关的操作的节点

    * `launch` - 正常申请实例并**在维护模式下**部署Minecraft服务器

    * `stop` - 软停止Minecraft服务器，并送回实例

    * `kill` - 强制停止Minecraft服务器，并送回实例

    * `get_key` - 获取通过SSH连接当前实例所需的privateKey

    * `revive` - 清除**主控端**当前的错误（如果有错误的话），尝试**从上次发生错误的地方**继续运行  

        > 注：仅用于一些偶发性错误，比如等待实例启动超时，但实例后来又正常启动了。

    * `wipe_butt` - “擦屁股”。主要功能是**直接送回实例**，清除Minecraft服务器相关数据，并清除主控端的错误，回到`2000`状态。

        > 注：相对来说这是**很危险**的操作，仅在`revive`无法清除错误的情况下使用！

    * `restore_and_launch` - 正常申请实例，在实例启动后**尝试恢复增量备份**（如果有的话），然后**在维护模式下**部署Minecraft服务器

    * `launch_and_discard_backup` - 正常申请实例，**抛弃已有的增量备份**，然后**在维护模式下**部署Minecraft服务器

    关于**维护模式**：

    1. 维护模式下实例端不会对Minecraft服务器进行监视，无论Minecraft服务器进程存在与否，实例都会持续运行下去。

    2. 维护模式下**在实例端**不会检查竞价实例是否即将被回收，但是这并不影响**主控端**这边的检查。

    3. 维护模式下，无论Minecraft服务器有没有玩家，都不会被自动停止（没有倒计时）。

    4. 综上，维护模式下，你只能通过`stop` / `kill`这些节点操作来停止Minecraft服务器并送回实例。

* `command` - Minecraft服务器命令节点

    * `send` - 向Minecraft服务器发送命令

* `mc_logs` - Minecraft服务器日志节点

    * `get` - 获取Minecraft服务器日志(`latest.log`)

* `query` - 状态查询节点

    * `mc` - 获取Minecraft服务器的状态信息
    
    * `backend` - 获取主控端(backend)的状态信息

## backend

backend节点下目前只有一个子节点：

* `token` - 主控端访问令牌节点

    * `generate` - 生成一个**用于游客访问**的临时令牌

    > 注：相关配置在[`api_configs.json`](configs.md#api_configsjson)的`tokens`配置项中。