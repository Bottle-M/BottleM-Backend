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