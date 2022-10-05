# BottleM-Backend
咱Minecraft服务器的主控端

## 目录

- [面向](#面向)
- [使用到的包](#使用到的包)
- [简介](#简介)
- [基本部署](#基本部署)
- [配置文件](#配置文件)
- [脚本与自制镜像](#脚本与自制镜像)
- [关于主控端状态码](#关于主控端状态码)
- [使用](#使用)
    - [请求HTTP API](#请求http-api)
        - [请求路径](#request-path)
        - [鉴权方式](#request-authorization)
        - [请求方式](#request-methods)  
        - [关于POST请求](#request-post)
        - [返回内容的公共字段](#request-pubfield)  
        - [错误信息](#request-errormsg)  
    - [通过WebSocket同步Minecraft服务器日志](#通过websocket同步minecraft服务器日志)  
        - [连接地址](#ws-address)  
        - [鉴权方式](#ws-authorization)
- [扩展](#扩展)
- [流程简述](#流程简述)
- [一些建议](#一些建议)  

## 面向

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

这算是我第三次写这类应用了。梦开始的地方在这里：[CloudMinecraft](https://github.com/SomeBottle/CloudMinecraft)，而第二次我写的东西（叫LoCo来着，基于PHP）因为过于屎山没法开源<del>（但尽管如此，LoCo竟然在我服务器强撑运行了一年，可以说是奇迹了）</del>。  

好在这回，我勉强把这玩意写的能看下去了。(っ ̯ -｡)

本项目包括两个部分：`BottleM-Backend`和`BottleM-InsSide`，这个仓库存放的是`Backend`的源码。  

`Backend`咱就称为“**主控端**”，而`InsSide`咱就称为“**实例端**”吧！  

主控端主要负责接受用户请求，并管理实例的开通与回收；而实例端则负责**Minecraft服务器**的部署与管理。  

主控端和实例端之间通过```WebSocket```协议进行通信。不过就算`WebSocket`连接断开了，实例端也能保证Minecraft服务器的**数据安全**。

这玩意是怎么工作的？看看[流程简述](#流程简述)吧~

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



## 关于主控端状态码



## 使用

### 请求HTTP API

<a id="request-path"></a>

* **请求路径**形如

    ```
    http://<主控端IP>:<HTTP API端口>/<主节点>/<子节点>/<操作>
    ```

    > 主节点/子节点这些详见文档：[节点及其权限](./docs/node_and_permissions.md)  

    比如我想**正常创建一个实例并部署Minecraft服务器**：

    *GET* `http://<主控端IP>:<HTTP API端口>/server/normal/launch`  

    -----

<a id="request-authorization"></a>

* **鉴权方式** 

    通过`Authorization`请求头进行鉴权。
    
    ```
    Authorization: Bearer <token>
    ```
    
    其中`<token>`是你的**访问令牌**。

    > 详见文档：[访问令牌](./docs/configs.md#user_tokensjson)

    访问特定的节点**需要特定的权限**，详见文档：[节点及其权限](./docs/node_and_permissions.md)

    ------

<a id="request-methods"></a>

* **请求方式**

    目前主要支持的方式是`GET`, `POST`以及`OPTIONS`。  

    - `OPTIONS` - 用于浏览器预检请求，直接返回`200 OK`，无任何其他操作
    - `POST` - 有少数几个节点操作**仅支持**`POST`请求方式:  

        - `/server/command/send`
        - `/backend/token/generate`

    - `GET` - 除了上述的操作外，其他所有节点操作都支持`GET`请求方式（`POST`也行）

    -----

<a id="request-post"></a>

* **关于*POST*请求**

    - 请求头：`Content-Type: application/json`
    - 请求体：序列化后的`JSON`字符串

<a id="request-pubfield"></a>

* **返回内容的公共字段**

    这里仅简述一下返回内容的公共字段，其他返回字段可见文档：[节点及其权限](./docs/node_and_permissions.md)。

    返回示例（`Content-Type: application/json`）：

    ```js
    {
        "data": {}, // 返回的数据
        "code": -1, // 返回的执行状态码
        "msg": "Lack of valid action" // 返回的执行信息
    }
    ```

    关于`code`字段的值：

    - `1` -> 执行成功
    - `0` -> 递交给了**异步**/**实例端**处理，暂时未知执行结果
    - `-1` -> 执行失败

<a id="request-errormsg"></a>

* **错误信息**

    | 错误信息 | 说明 |
    |:---:|:---:|
    | `Lack of valid action` | 对于节点缺少有效的操作，可能你请求的路径并不存在 |
    |`Request Entity Too Large`| 请求体过大，*POST*的数据超过了`1MB` |
    |`Unauthorized`|没有[按照要求](#request-authorization)进行鉴权|
    |`Permission Denied`|你所持的令牌没有访问目前节点操作的权限|
    |`Failed to generate: <msg>`|生成临时令牌失败，`<msg>`是失败原因|
    |`Non-existent Node`|请求了一个不存在的节点|
    |`Minecraft Server Not Running.`|Minecraft服务器不在运行中，指定节点操作无法执行|
    |`Command not specified`|向Minecraft服务器发送命令时没有指定命令（请求体JSON中没有`command`字段）|
    |`Private key not found.`|没有找到实例SSH私钥。这往往是因为尚未创建实例|
    |`Method Not Allowed`|该使用`POST`请求方式的地方没有用，详见[这里](#request-methods)|
    |`Invalid Request`|无效访问，一般是访问子节点错误，这个错误很少见|
    |`Invalid Path`|无效路径，这个问题我好像都没怎么遇到了|
    |`There's no need to revive.`|主控端没有发生错误，无须尝试恢复。仅在请求`/server/maintenance/revive`时可能出现|
    |`Server is not running.`|Minecraft服务器不在运行中。仅在关闭和杀死服务器时可能出现|
    |`Error exists, unable to launch the server`|主控端发生了错误，无法启动Minecraft服务器。|
    |`Server Already Launched`|Minecraft服务器已经在运行中。仅在启动服务器时可能出现|
    |`Urgent backup exists, please use action: restore_and_launch or launch_and_discard_backup`|紧急备份存在，只能通过`restore_and_launch`和`launch_and_discard_backup`操作启动Minecraft服务器|
    

### 通过WebSocket同步Minecraft服务器日志

主控端WebSocket服务目前只用于**实时同步Minecraft服务器的控制台日志**。

值得注意的是，这里的实时同步是**增量的**，每次Minecraft服务器日志更新时，主控端这儿只会同步自上次同步以来**新增的日志内容**。

如果你需要获得**自Minecraft服务器启动以来的所有日志**，建议你请求HTTP API的这个节点操作：[`/server/mc_logs/get`](./docs/node_and_permissions.md#node-mc_logs)。

<a id="ws-address"></a>

* **连接地址**

    ```
    ws://<主控端IP>:<WebSocket端口>
    ```

<a id="ws-authorization"></a>

* **鉴权方式**

    **建立WebSocket连接**后，向主控端发送一个包含`key`字段的`JSON`字符串，以下是连接示例代码：

    ```javascript
    const TOKEN = 'MY TOKEN....';
    const ws = new WebSocket('ws://localhost:2334');
    ws.addEventListener('open', () => {
        console.log('connected');
        let sendObj = {
            key: TOKEN // 你的访问令牌
        }
        ws.send(JSON.stringify(sendObj));
    });
    ```

    如果你具有`websocket.mclog.receive`权限（详见[节点及其权限](./docs/node_and_permissions.md#node-mclog)），就会正常收到来自Minecraft服务器的控制台日志。

    但如果你不具有这个权限，WebSocket连接会被立刻关闭，关闭理由是`Nanoconnection, son.`。

## 扩展

## 流程简述




## 一些建议