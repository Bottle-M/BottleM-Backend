# BottleM-Backend
咱Minecraft服务器的主控端

## 设计

这个项目目前主要针对的是像朋友服一类的小型、**即开即玩**的**单个**Minecraft服务器。

Minecraft服务器部署过程由`Bash`脚本驱动。

## 使用到的包

| 包名 | 开源协议 |
|:---|:---|
| [tencentcloud-sdk-nodejs](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/) | Apache License 2.0 |
| [ssh2](https://github.com/mscdex/ssh2) | MIT |
| [chalk](https://github.com/chalk/chalk) | MIT |
| [ws](https://github.com/websockets/ws) | MIT |
| [minecraft-protocol](https://github.com/PrismarineJS/node-minecraft-protocol) |  BSD-3-Clause license  |
| [rcon](https://github.com/pushrax/node-rcon) | MIT |

## 简介

本项目包括两个部分：`BottleM-Backend`和`BottleM-InsSide`，这个仓库存放的是`Backend`的源码。  

`Backend`咱就称为“**主控端**”，而`InsSide`咱就称为“**实例端**”吧！  

主控端主要负责接受用户请求，并管理实例的开通与回收；而实例端则负责**Minecraft服务器**的部署与管理。  

主控端和实例端之间通过```WebSocket```协议进行通信。不过就算`WebSocket`连接断开了，实例端也能保证Minecraft服务器的**数据安全**。  

## 基本部署

1. 将项目克隆到本地，并进入目录

    ```bash
    git clone https://github.com/Bottle-M/BottleM-Backend.git
    cd BottleM-Backend
    ```

2. 安装依赖包

    ```bash
    npm install
    ```

3. 修改配置文件（[见下方](#配置文件)）

4. 启动HTTP API和WebSocket服务

    ```bash
    npm start
    ```

    输出示例：

    ![](./docs/pics/api_launch.png)  

    * `[Extension]`提示扩展模块已经载入
    * 图中第二行指出HTTP API服务监听`2333`端口
    * 图中第三行指出WebSocket服务监听`2334`端口

## 配置文件

详见[配置文件文档](./docs/configs.md)。

## 脚本与自制镜像

## 关于状态码



## 使用

### 请求HTTP API

* **请求路径**形如

    ```
    http://<主控端IP>:<HTTP API端口>/<主节点>/<子节点>/<操作>
    ```

    > 主节点/子节点这些详见文档：[节点及其权限](./docs/node_and_permissions.md)  

    比如我想**正常创建一个实例并部署Minecraft服务器**：

    *GET* `http://<主控端IP>:<HTTP API端口>/server/normal/launch`  

    -----

* **鉴权方式** 

    通过`Authorization`请求头进行鉴权。
    
    ```
    Authorization: Bearer <token>
    ```
    
    其中`<token>`是你的**访问令牌**。

    > 详见文档：[访问令牌](./docs/configs.md#user_tokensjson)

    ------

* **请求方式**

    目前主要支持的方式是`GET`, `POST`以及`OPTIONS`。  

    - `OPTIONS` - 用于浏览器预检请求，直接返回`200 OK`，无任何其他操作
    - `POST` - 有少数几个节点操作**仅支持**`POST`请求方式:  

        - `/server/command/send`
        - `/backend/token/generate`

    - `GET` - 除了上述的操作外，其他所有节点操作都支持`GET`请求方式（`POST`也行）

    -----

* **关于*POST*请求**

    - 请求头：`Content-Type: application/json`
    - 请求体：序列化后的`JSON`字符串

* **返回内容**

* **错误信息**