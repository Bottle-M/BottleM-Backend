# BottleM-Backend
咱Minecraft服务器的主控端

## 目录

- [面向](#面向)
- [使用到的包](#使用到的包)
- [简介](#简介)
- [基本部署](#基本部署)
- [配置文件](#配置文件)
- [脚本与自制镜像](#脚本与自制镜像)
    - [自制镜像](#自制镜像)  
    - [使用默认脚本](#使用默认脚本)
    - [默认脚本对应的COS储存桶中存放的内容](#默认脚本对应的cos储存桶中存放的内容)
    - [关于Bash脚本的环境变量](#关于bash脚本的环境变量)
- [关于主控端状态](#关于主控端状态)
    - [主控端状态码](#主控端状态码)
    - [主控端发生错误时的状态码](#主控端发生错误时的状态码)
    - [发生错误时的操作](#发生错误时的操作)  
    - [特殊的情况](#特殊的情况)  
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
    - [扩展模块必须要有的](#扩展模块必须要有的)  
    - [主控端事件](#主控端事件)  
- [增量备份](#增量备份)
- [流程简述](#流程简述)
    - [启动实例](#启动实例)  
    - [部署实例端(InsSide)程序](#部署实例端insside程序)
    - [建立和实例端(InsSide)的连接](#建立和实例端insside的连接)  
    - [实例端(InsSide)部署Minecraft服务器](#实例端insside部署minecraft服务器)
    - [监控Minecraft服务器](#监控minecraft服务器)  
    - [**Extra:** 主控端检查竞价实例是否即将被回收](#主控端检查竞价实例是否即将被回收)
    - [**Extra:** 断线重连](#断线重连)  
    - [实例端准备进入收尾流程](#实例端准备进入收尾流程)  
    - [关闭Minecraft服务器](#关闭minecraft服务器)  
    - [打包并上传Minecraft服务端](#打包并上传minecraft服务端)  
    - [实例端向主控端说再见](#实例端向主控端说再见)  
    - [主控端进行收尾工作](#主控端进行收尾工作)  
- [一些建议](#一些建议)  
- [License](#license)  

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

绝大多数时候，**用户只与主控端进行交互**。<del>实例端：我透明啦๐·°(৹˃̵﹏˂̵৹)°·๐</del>

主控端和实例端之间通过```WebSocket```协议进行通信。不过就算`WebSocket`连接断开了，实例端也能保证Minecraft服务器的**数据安全**。

这玩意是怎么工作的？看看[流程简述](#流程简述)吧~

## 基本部署

注：Minecraft服务器进程**监听的端口**目前只能是`25565`。

1. 将项目克隆到本地，并进入目录

    ```bash
    git clone https://github.com/Bottle-M/BottleM-Backend.git
    cd BottleM-Backend
    ```

2. 安装依赖包

    ```bash
    npm install
    ```

3. 自制镜像，见[下方](#自制镜像)  

4. 修改/重写`./scripts/`下的部署脚本（最重要的一步），并将Minecraft服务端文件上传到云储存桶中。

    > 如果你想使用我已经写好的脚本，不妨来看看[这里](#使用默认脚本)  

5. 修改配置文件（[见下方](#配置文件)）

6. 启动HTTP API和WebSocket服务

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

本项目中Minecraft服务器的部署是依赖于`Bash`脚本的，这些脚本都存放在`./scripts`目录下。

很容易能发现，`./scripts`目录下已经有了一套脚本，希望这套脚本能给大伙儿带来一些参考。

> 注：[流程简述](#流程简述)这节简述了这些脚本是如何参与部署过程的。

如果想**直接使用这套**脚本，那么请接着往下看吧。

### 自制镜像

为了配合Bash脚本，你首先需要制作一个自制镜像。

比如我为**默认的脚本**制作了这样的一个镜像：

* 基于腾讯云镜像：`CentOS 7.9 64位`
* 预装程序：

    - `JDK 17.0.3.1` (Minecraft 1.19.x需要Java 17+的支持)
    - `lz4` (快速压缩算法)
    - `screen` (多视窗管理)
    - `axel` (多线程下载)
    - `coscli` (腾讯云COS命令行工具，[项目地址](https://github.com/tencentyun/coscli))  
      > 注：所在路径为`/root/coscli`


### 使用默认脚本

如果你想使用`./scripts`中已有的脚本，你首先得要稍微修改一下`./scripts/setup_cos.sh`这个脚本：

```bash
#!/bin/bash

# 设置COSCLI工具
./coscli config set --secret_id $QCLOUD_SECRET_ID --secret_key $QCLOUD_SECRET_KEY  

# 设置新的储存桶
./coscli config add -b <YOUR_BUCKET> -r ap-chengdu -a minecraft
```

在腾讯云COS对象储存控制台创建一个储存桶，然后将`<YOUR_BUCKET>`替换为你的储存桶名。而`ap-chengdu`则需要替换为你的储存桶所在的地域代号。

> 关于COSCLI工具的使用可以参考[腾讯云官方文档](https://cloud.tencent.com/document/product/436/63143)。

接下来，你需要在储存桶中创建一些目录并**上传Minecraft服务端相关的文件**，详见下一节 ↓

### 默认脚本对应的COS储存桶中存放的内容

```  
└─server
        filelist.txt
        server_0
        server_1
```

储存桶根目录只有一个`server`目录，目录内存放着多个文件。

其中`filelist.txt`文件内记录的是部署时**需要下载的Minecraft服务端压缩包文件名**，每行一条：

```txt
server_0
server_1

```
> 注：记得**最后要留一个换行符**。另外一定要采用`LF`行尾序列，不然Bash脚本可能会报错。

而`server_0`, `server_1`文件实际上是分块后的**Minecraft服务端压缩包**（采用`lz4`算法压缩），具体参考[`compress_and_path.sh`](./scripts/compress_and_pack.sh)。

> 默认脚本中是按`2GB`一个文件进行分割的。

-----

在完成[自制镜像](#自制镜像)，[使用默认脚本](#使用默认脚本)，[默认脚本对应的COS储存桶中存放的内容](#默认脚本对应的COS储存桶中存放的内容)这三节描述的步骤后，就可以进入下一步：[修改配置文件](#配置文件)了。


### 关于Bash脚本的环境变量

详见[配置文件文档](./docs/configs.md#shell脚本的环境变量)。

## 关于主控端状态

### 主控端状态码

主控端状态码对应的提示语的配置详见[配置文件文档](./docs/configs.md#status_codesjson)。

接下来列一下各状态码的含义：

| 状态码 | 含义 |
|:---:|:---:|
|2000|实例未创建，主控端正在无所事事|
|2001|正在按照配置查询实例价格并挑选合适的实例|
|2002|正在创建SSH密匙对|
|2003|正在创建实例|
|2100|实例已创建，正在等待实例启动|
|2101|实例已启动，正在尝试通过SSH连接实例|
|2102|正在将部署所需脚本传向实例（通过SFTP）|
|2103|正在执行部署脚本搭建`InsSide`（实例端）|
|2200|正在尝试建立与`InsSide`（实例端）的WebSocket连接|
|2201|成功连接到`InsSide`（实例端），也说明实例端成功部署|
|2202|正在执行Minecraft服务器相关的部署脚本|
|2203|上述脚本执行成功，正在等待Minecraft服务器启动|
|2300|Minecraft服务器成功启动！！|
|2400|正在等待Minecraft服务器关闭|
|2401|Minecraft服务器已关闭，正在打包Minecraft服务端|
|2402|正在上传上述打包好的Minecraft服务端|
|2500|`InsSide`（实例端）工作结束，向主控端说再见。主控端此时在销毁实例，并删除SSH密匙对|

### 主控端发生错误时的状态码

主控端发生错误时，状态码会在**正常情况**的基础上减去`1000`。

比如实例已经创建，主控端在等待实例启动（此时状态码为`2100`）。然而实例启动花了很久，主控端认为超时了，此时状态码会变为`1100`（发生错误）。

### 发生错误时的操作

主控端发生错误后，大部分节点操作**都无法执行**，除了下面这两个，它们可以用于恢复主控端的运行：

* [```/server/maintenance/revive```](./docs/node_and_permissions.md#maintenance-revive)  

* [```/server/maintenance/wipe_butt```](./docs/node_and_permissions.md#maintenance-wipe_butt)  

点击查看文档 ↑ 

> 注：`wipe_butt`可能导致部分数据丢失，建议只在错误完全无法恢复时使用。

### 特殊的情况

在状态码为`2001`（正在按照配置查询实例价格并挑选合适的实例）时，如果腾讯云**没有符合要求的实例资源**了，主控端会报告：  

```
No available instance (that meet the specified configuration)
(服务商没有符合你配置要求的实例资源了)
```

然而在这之后，主控端**不会进入错误状态**，而是回到`2000`（实例未创建，主控端正在无所事事）状态。

稍后如果服务商有资源了，你可以再次尝试创建实例。


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

为了实现和消息机器人通信一类的功能，主控端可以接纳一些JavaScript扩展模块。  

这些扩展模块存放在项目的`extensions`目录下，在这个目录内有一个实例模块[`informer.js`](./extensions/informer.js)。 

### 扩展模块必须要有的

扩展中一定要导出(`exports`)一个函数，这个函数的返回值是一个布尔值，代表**该扩展是否成功载入**：

```javascript
/**
 * 扩展载入方法，由extensions-loader调用
 * @returns {Boolean} 是否正确载入
 */
module.exports = function () {
    return true; // 一切正常
};
```

### 主控端事件

扩展模块的运作依赖于**事件**，在`informer.js`中能看到头部引入了事件模块：

```javascript
// 导入EventEmitters
const events = require('../basic/events');
```

`events`对象包含两个`EventEmitter`：

- `MessageEvents` - 主控端消息相关的事件

    | 事件名 | callback参数 | 说明 |
    |:---:|:---:|:---:|
    |`statusupdate`|`(msg, inform, code)`|主控端状态码更新时触发，`msg`是状态码对应的消息，`inform`是状态码对应的消息**是否建议**通知，`code`是状态码|
    |`normalmsg`|`(msg, inform)`|主控端输出一条**普通消息**时触发，`msg`是消息内容，`inform`是消息**是否建议**通知|
    |`warningmsg`|`(msg, inform)`|主控端输出一条**警告消息**时触发，`msg`是消息内容，`inform`是消息**是否建议**通知|
    |`errormsg`|`(msg, inform)`|主控端输出一条**错误消息**时触发，`msg`是消息内容，`inform`是消息**是否建议**通知|

- `ServerEvents` - Minecraft服务器相关的事件
    | 事件名 | callback参数 | 说明 |
    |:---:|:---:|:---:|
    |`mclogupdate`|`(logStr)`|Minecraft服务器控制台日志更新时触发，`logStr`是**新增的**日志内容|
    |`getip`|`(ip)`|获取到实例IP地址时触发，`ip`是IP地址|
    |`launchsuccess`|`(ip)`|Minecraft服务器成功启动后触发，`ip`是实例IP地址|
    |`serverclosed`|`(reason)`|Minecraft服务器被关闭时触发，`reason`是关闭原因|

比如我要在Minecraft成功启动（`ServerEvents`的`launchsuccess`事件）后通知群内的所有人，可以这样写：

```javascript
events.ServerEvents.on('launchsuccess', (ip) => {
    // 假设有sendToGroup这个方法
    sendToGroup(`Server successfully launched, ip: ${ip}`);
});
```

## 增量备份

详见[这个文档](./docs/incremental_backup.md)。  

## 流程简述

这里简单叙述一下一次完整的从开服到关服的流程，忽略了一些我觉得没必要讲的细节。（有兴趣的话可以看看源码）

### 启动实例

假设此时用户请求的节点操作是`/server/normal/launch`，那么主控端会执行以下操作：

1. 主控端进入`2001`状态。请求腾讯云API，获得（选定地域中的）**所有实例的配置**，然后根据`api_configs`中的`qcloud`[配置](./docs/configs.md#api_configs)对这些实例**进行筛选**，找出符合条件的实例，组成一个**实例配置数组**。  

    > 未经筛选过的**所有实例的配置**将被序列化为一个JSON文件，暂存在`server_data/all_available_ins.json`中。

2. 如果这个**实例配置数组**为空，主控端会回到`2000`状态，并提示用户没有可用的实例资源。如果其不为空，进入**第3步**。

3. 主控端进入`2002`状态，请求腾讯云API生成一对**SSH密匙对**，接着取得其中的**私匙**，暂存在`server_data/login.pem`文件中。  

    > 同时，主控端也将这个密匙对的**唯一id**以字段名`instance_key_id`储存在`server_data/instance_details.json`文件中。

4. 主控端进入`2003`状态，请求腾讯云API**创建实例**，接着取得其中的**实例id**，以字段名`instance_id`暂存在`server_data/instance_details.json`文件中。  

### 部署实例端(InsSide)程序

1. 主控端进入`2100`状态，通过腾讯云API**轮询**实例是否启动（进入`RUNNING`状态），如果**在规定时间内**实例启动了，进入**第2步**，否则进入错误状态`1100`（实例启动超时）。

    > 规定时间指的是[`api_configs`](./docs/configs.md#api_configs)中的`instance_run_timeout`配置项。  

2. 第1步中如果实例进入了`RUNNING`状态，主控端就能拿到实例的**IP地址**，并将其以字段名`instance_ip`暂存在`server_data/instance_details.json`文件中。  

3. 主控端进入`2101`状态，开始尝试**通过SSH连接到实例**，如果连接成功，进入**第4步**，否则进入错误状态`1101`（SSH连接失败）。

<a id="make-insside-tmp-config"></a>

4. 主控端进入`2102`状态。接下来主控端将[`api_configs`](./docs/configs.md#api_configs)中的`ins_side`配置项单独序列化成一个JSON文件，**作为实例端程序`InsSide`的配置文件**，暂存在`server_data/ins_side_configs.tmp.json`中。  

    <a id="extra-fields-for-insside"></a>

    这个配置文件中还包括了额外的字段：

    ```javascript
    {
        // 是否在维护模式下启动
        'under_maintenance': [Boolean], 
        // 启动后是否恢复增量备份（如果backup_records为空的话，这一项无效）
        'restore_before_launch': [Boolean], 
        // 备份记录数组，如果没有就是null
        'backup_records': [Array|null],
        // 主控端和实例端通信时鉴权用的密钥, 自动生成的128位字符串
        'secret_key': [String],
        // Bash脚本的公共环境变量
        'env': [Object]
    }
    ```

<a id="upload-to-data-dir"></a>

5. 主控端将`./scripts`目录下的**所有Bash脚本**和**第4步中的实例端配置文件**一起上传到实例中的**数据目录**下。  
    如果上传失败，会进入错误状态`1102`。

    > 这里的数据目录指的是[`api_configs`](./docs/configs.md#api_configs)中的`ins_side`配置项的`data_dir`字段。  

6. 主控端进入`2103`状态，开始执行**部署实例端(InsSide)程序的脚本**以启动实例端。  
    如果执行失败，会进入错误状态`1103`。

    >（对应配置项：[`api_configs.ins_side.instance_deploy_sh`](./docs/configs.md#api_configs)），默认的脚本是`./scripts/set_up_base.sh`。  

    > 执行这个脚本的时候**不支持**特殊的[环境变量](./docs/configs.md#shell脚本的环境变量)。  
    > 请务必多次调试以保证这些Bash脚本都能正常执行而不是抛出错误。

7. 我写好的`set_up_base.sh`脚本主要会做这几件事：  

    - 创建目录`/root/BottleM-InsSide`

    - 从[`Gitee Releases`](https://gitee.com/somebottle/BottleM-InsSide/releases)下载（`axel`多线程下载）最新的`InsSide`程序可执行文件到`/root/BottleM-InsSide`目录下。

    - 在`screen`进程管理下执行`daemon.sh`脚本。这个脚本主要作用是**启动**`/root/BottleM-InsSide`目录下的实例端(InsSide)程序，并实现**实例端(InsSide)崩溃后的自动重启**。

### 建立和实例端(InsSide)的连接

1. 主控端进入`2200`状态，尝试通过配置的端口（配置项：`api_configs.ins_side.ws_port`）连接到实例端(InsSide)进程。如果成功建立WebSocket连接，进入**第2步**。  
    如果连接超时，会进入错误状态`1200`。

2. 主控端向实例端发送`status_sync`请求，实例端会返回**当前的状态码**，这样来实现与实例端的状态码同步。

    > 实例端一经启动，会**立即开始**Minecraft服务器部署的工作，状态码从`2201`开始。  

### 实例端(InsSide)部署Minecraft服务器

从这里开始，主角就是实例端了。主控端在建立和实例端的连接后只负责**错误处理/状态码同步/用户操作传递/日志同步**等工作。  

实例端的日志会通过连接回传给主控端，实例端发生错误时会通知主控端，实例端状态码发生更新时也会同步到主控端。  

而用户的关服、发送命令等操作则由主控端递交给实例端执行。可见二者是相互协作的关系。  

------

实例端(InsSide)**一经启动**，会**立即开始**Minecraft服务器部署的工作，状态码从`2201`开始。

1. 实例端进入`2202`状态，检查并创建必要的目录，如：
    * 打包后的Minecraft服务端存放的绝对路径 - `api_configs.ins_side.packed_server_dir`
    * Minecraft服务端的绝对路径 - `api_configs.ins_side.mc_server_dir`

2. 执行所有的**Minecraft服务器部署脚本**（配置项：`api_configs.ins_side.deploy_scripts`）。  
    在`./scripts`下有我写的两个脚本`setup_cos.sh`和`get_server.sh`，他们的作用分别是：

    - `setup_cos.sh`
    
        配置`COSCLI`，使得其能正常访问腾讯云COS储存桶。  

    - `get_server.sh`  

        1. 从COS储存桶下载分块的文件列表`server/filelist.txt`  

        2. 根据`filelist.txt`，从COS储存桶下载分块的Minecraft服务端压缩包文件  

            > 上面两步的文件都下载到了`api_configs.ins_side.packed_server_dir`配置的目录下

        3. 将分块的Minecraft服务端压缩包文件合并为一个完整的压缩包文件并**解压**到`api_configs.ins_side.mc_server_dir`配置的目录下

<a id="init-incremental-backup"></a>

3. 初始化增量备份  

    这一步扫描了`api_configs.ins_side.incremental_backup.src_dirs`配置的**增量备份源目录**中的所有文件，记录了它们的**最新修改日期**。

4. 检查是否需要恢复/丢弃增量备份

    在[这里](#extra-fields-for-insside)可以看到主控端传给实例端的配置中包含了两项和增量备份有关的配置项：

    - `restore_before_launch` - 是否在启动Minecraft服务器前恢复增量备份

    - `backup_records` - 增量备份记录

    如果`backup_records`不为空，那么实例端会根据`restore_before_launch`的值来决定在启动Minecraft服务器前如何对待增量备份：

    - `restore_before_launch`为`true`时，实例端会**恢复**增量备份

    - `restore_before_launch`为`'discard'`时，实例端会**抛弃**增量备份

    > 如果`backup_records`为空，则`restore_before_launch`没有效果，不会对增量备份做出操作。  

<a id="pre-scan-pack-size"></a>

5. 扫描部署前服务端压缩包文件大小

    如果配置项`api_configs.ins_side.check_packed_server_size`**大于0**，实例端会对**Minecraft服务端压缩包文件大小**进行**扫描和记录**。  

    **第2步**中Bash脚本将Minecraft服务端文件下载到了`api_configs.ins_side.packed_server_dir`配置的目录中。

    ↑ 实例端程序此时扫描的也正是这个目录中**所有文件的大小**

    > 因此，如果你配置了`api_configs.ins_side.check_packed_server_size > 0`，那么在Bash脚本解压Minecraft服务端之后**不要删掉**这个目录中的内容，不然会报错：`Packed server directory is empty!`  
    > 程序在扫描完大小后会**自动清空**这个目录。

6. 执行**Minecraft服务器启动脚本**（配置项：`api_configs.ins_side.launch_script`）  

    > 我写的启动脚本是`./scripts/launch_server.sh`，Minecraft服务器进程受screen进程监管。

7. 实例端进入`2203`状态，**轮询**Minecraft服务器是否启动（通过`minecraft-protocol`包的`ping`方法）。

    > 如果在`api_configs.ins_side.mc_server_launch_timeout`配置的时间内启动了，就进入下一个环节。  
    > 反之，就会报错：`Minecraft server launch timeout!`，且进入错误状态`1203`。  

### 监控Minecraft服务器

Minecraft服务器成功启动后，实例端会进入`2300`状态，**启动RCON连接**，并同时启动几个**定时器**/**事件监听器**：  

1. Minecraft服务器**日志监听器**

    实例端会监听Minecraft服务器的日志文件（配置项：`api_configs.ins_side.mc_server_log`）的**新增内容**，并将**新增的**日志内容回传给主控端。  

2. Minecraft服务器**空闲时间计时器**（仅限**非维护模式**）

    服务器中没有玩家游玩时，就进入了空闲状态中。  
    
    在Minecraft服务器空闲了一定长时间后（配置项：`api_configs.ins_side.server_idling_timeout`），实例端会**自动关闭**Minecraft服务器。  

    > 每过一段时间，实例端会向主控端回传一次当前**剩余的空闲时间**（单位：秒）。

    > 关闭Minecraft服务器时是**正常关闭**。

3. Minecraft服务器**进程监视器**（仅限**非维护模式**）

    实例端通过反复执行`api_configs.ins_side.server_scripts.check_process`配置的**Bash脚本**，来**监视Minecraft服务器进程是否存在**。  

    > 如果该脚本**没有输出任何内容**，则说明**Java进程不存在**

    我写的脚本是[`./scripts/check_process.sh`](./scripts/check_process.sh)，采用了`netstat`命令来找出**监听25565端口**的进程。  

    > 如果进程不存在，实例端会**跳过关闭Minecraft服务器**的流程，直接进入下一个环节。

4. **竞价实例回收**监视器（仅限**非维护模式**）  

    实例端通过反复执行`api_configs.ins_side.server_scripts.check_termination`配置的**Bash脚本**，来**监视竞价实例是否即将被回收**。 

    > 竞价实例有半途被回收的可能，需要一定的应对措施。  
    > 如果该脚本**没有输出任何内容**，则说明**实例即将被回收**  

    > 实例即将被回收时，实例端会**正常关闭Minecraft服务器**，并紧急**进行一次增量备份**。

5. **玩家上线事件**监听器（仅限**非维护模式**） 

    玩家上线后，实例端会**暂停**空闲时间计时器。  

    > 如果`api_configs.ins_side.player_login_reset_timeout`配置为了`true`，那么玩家上线后，服务器**目前闲置的时间**也会**归零**。  

6. **服务器最后一位玩家下线**监听器（仅限**非维护模式**） 

    Minecraft服务器中最后一位玩家下线后，实例端会**恢复空闲时间计时器**。  

<a id="incremental-backup-interval"></a>

7. **增量备份**计时器（**如果开启了增量备份**）

    配置项`api_configs.ins_side.incremental_backup.interval`指定了每两次**增量备份**之间的**时间间隔**。  

    如果开启了增量备份，实例端会**每隔这段时间**，进行一次增量备份。  

    > 关于增量备份请看[这里](#增量备份)  

8. **停止Minecraft服务器事件**的监听器

    用户对于Minecraft服务器的**停止**操作，会由主控端递交给实例端，并在实例端以**事件**的形式被触发。  

    > 这个事件一旦被触发，实例端会**正常关闭Minecraft服务器**。

9. **杀死Minecraft服务器事件**的监听器

    用户对于Minecraft服务器的**杀死**操作，会由主控端递交给实例端，并在实例端以**事件**的形式被触发。  

    > 这个事件一旦被触发，实例端会**跳过关闭Minecraft服务器**的流程，直接打包Minecraft服务端进行上传。  

10. **紧急停止Minecraft服务器事件**的监听器

    这个事件仅在**竞价实例即将被回收**时被触发。  

    紧急模式下，实例端仍然会**正常关闭Minecraft服务器**，但不同的是Minecraft服务器停止后，实例端**仅执行一次增量备份**并回传增量备份记录给主控端，而不会执行**完整的打包上传流程**。

    > 这是因为竞价实例即将被回收时往往只剩几分钟的缓冲时间了，只能尽快进行增量备份。  

11. **玩家人数**监视器

    实例端会**每隔一段时间**查询Minecraft服务器中的玩家人数，并向主控端**上报**。  

    > **玩家上线事件**和**服务器最后一位玩家下线**在这里被触发。

### 主控端检查竞价实例是否即将被回收

鉴于各服务商提供的竞价实例状态查询接口不尽相同，除了在实例端有**查询竞价实例是否被回收的脚本**，主控端也会**每隔一段时间**查询竞价实例的状态。  

> 比如腾讯云查询竞价实例是否被回收需要在**实例**上请求特定的URL来获得实例的元数据，  
> 而阿里云的实例Describe API则可以直接查询实例的状态。

主控端检查竞价实例的部分写死在**对应的模块里**了，比如本项目我是和腾讯云进行对接的，就必须在[`qcloud.js`](./api/qcloud.js)内写一个`checkTermination`方法：

```javascript
/**
 * 检查竞价实例是否即将被回收
 * @param {String} insId 实例id
 * @returns {Promise} resolve一个布尔值，true表示即将被回收，false表示不会被回收
 * @note 暂时直接resolve(false)，因为腾讯云没有提供API，只能在实例端请求metadata
 */
function checkTermination(insId) {
    return Promise.resolve(false);
}
```

如果上面这个方法`resolve`了一个`true`，那么主控端会给实例端发送**紧急停止Minecraft服务器**的信号。

（会触发上面的**紧急停止Minecraft服务器事件**）

### 断线重连

实例端和主控端通过`WebSocket`连接通信，但因为网络波动的原因，往往难以保证整个流程中连接不会断开。  

每当实例端和主控端的连接断开时，**主控端会尝试重新建立连接**：

1. 创建一个新的**临时配置文件**`ins_side_configs.tmp.json`，**重新生成**实例端和主控端连接鉴权用的128位密匙。  

    > 本步骤可参考[这里](#make-insside-tmp-config)  

2. 尝试通过SSH连接到实例，连接成功后**通过SFTP**上传`ins_side_configs.tmp.json`到实例中的[对应目录](#upload-to-data-dir)。  

3. 尝试建立主控端和实例端的WebSocket连接，连接成功后**删除本地的临时配置文件**`ins_side_configs.tmp.json`。  

4. 连接成功后主控端向实例端发送`status_sync`请求，实例端会返回**当前的状态码**，这样来实现与实例端的状态码同步。

其中**第2步**和**第3步**是**有重试次数**的，分别对应配置项：  

- `api_configs.ssh_connect_retry` - SSH连接建立重试次数

- `api_configs.instance_ws_connect_retry` - 实例端WebSocket连接建立重试次数

⚠ 如果**在有限的重试次数内**，主控端一直都无法连接到实例端，那么主控端会**直接进入**[收尾流程](#主控端进行收尾工作)。

### 实例端准备进入收尾流程

紧接[监控Minecraft服务器](#监控minecraft服务器)这一节。

在接收到关闭指令后，实例端会**退出监视器**，进入**收尾阶段**，程序内对于这个阶段传递了三个字段：

```javascript
{
    // Minecraft服务器关闭原因
    reason: [String],
    // 是否通过RCON向Minecraft服务器发送关闭指令并等待关闭
    stop: [Boolean], 
    // 是否是紧急模式
    urgent: [Boolean]
}
```

`stop`为`true`时往往是软停止Minecraft服务器，用于：

- Minecraft服务器闲置超时，自动关闭
- **竞价实例即将被回收**，紧急关闭
- Minecraft服务器被用户（往往是管理员）手动关闭(stop)

`stop`为`false`时往往**不会等待Minecraft服务器关闭**，用于：

- Minecraft服务器**进程**已经结束
- Minecraft服务器被用户（往往是管理员）手动**杀死**(kill)

`urgent`只有在**竞价实例即将被回收**时才会为`true`。

### 关闭Minecraft服务器

实例端进入`2400`状态。

如果`stop`为`true`，那么实例端会**通过RCON**向Minecraft服务器发送`stop`命令，然后**等待Minecraft服务器关闭**。

> 等待Minecraft服务器关闭靠`api_configs.ins_side.server_scripts.check_process`配置的**Bash脚本**来实现。
> 如果`stop`为`false`，跳过此流程。

### 打包并上传Minecraft服务端

实例端会先**通知主控端**：**Minecraft服务器已关闭**。

然后实例端进入了`2401`状态。

-------

<a id="insside-end-normally"></a>

接下来，如果`urgent`为`false`（非紧急模式）：

1. 实例端会执行`api_configs.server_ending_scripts.pack`配置的**Bash脚本**，压缩并打包Minecraft服务端，制成压缩包文件。  

    这一部分我写的脚本是[`compress_and_pack.sh`](./scripts/compress_and_pack.sh)，它主要做的事是：  

    - 通过`tar`命令和`lz4`压缩程序，将Minecraft服务端打包成压缩包文件`serverAll.tar.lz4`。

        > 该压缩包和下面生成的文件都存放在`api_configs.ins_side.packed_server_dir`配置的目录下。

    - 将压缩包文件`serverAll.tar.lz4`按`2GB`一块分为几个文件`server_0`, `server_1`...  
    - 删除`serverAll.tar.lz4`
    - 扫描分块得到的所有文件的名字，**一行一条文件名**地输出到`filelist.txt`文件

2. **如果**配置了`api_configs.ins_side.check_packed_server_size > 0`  

    > 在 `api_configs.ins_side.check_packed_server_size <= 0` 或  
    > **维护模式**下，会跳过这一个流程，不对打包后的文件大小进行检查。

    实例端会再次扫描`api_configs.ins_side.packed_server_dir`（打包目录）配置的目录下所有的文件总大小（记为`CURR_SIZE`），并和**部署开启前**[扫描到的文件总大小](#pre-scan-pack-size)（记为`PREV_SIZE`）进行对比：  

    （设`PERCENTAGE`= `api_configs.ins_side.check_packed_server_size`）

    - 如果`CURR_SIZE × PERCENTAGE% <= PREV_SIZE`，这说明刚刚压缩打包制成的文件总大小**过小了**，这意味着打包过程中可能出现了问题，导致**服务端文件有一部分丢失了**！  

        > 这种情况下实例端会给主控端上报错误：`There's something wrong with the compressed packs of Minecraft Server, please check it.`，主控端状态转变为`1401`。

3. 实例端进入`2402`状态。

4. 接下来实例端会执行`api_configs.server_ending_scripts.upload`配置的**Bash脚本**，将`api_configs.ins_side.packed_server_dir`（打包目录）目录中的文件**上传到云储存中**。  

    这一部分我写的脚本是[`upload_server.sh`](./scripts/upload_server.sh)，它主要做的事是：

    - 将`filelist.txt`文件上传到云储存中，作为分块文件索引
    - 逐行读取`filelist.txt`文件，将**分成块**的压缩包文件上传到云储存中

5. **如果启用**了增量备份，这一步会抛弃掉**所有现存的增量备份**。

    > 这一步也会通知主控端**删除所有的增量备份记录**，因为**第4步**中已经把**所有的服务端文件**都上传到云储存中了（相当于一次全量备份），所以**现存的增量备份**已经没有意义了。  

------

<a id="urgently-end"></a>

如果`urgent`为`true`（**紧急**模式）：

假使**没有开启增量备份**，整个收尾流程和[**非紧急**模式](#insside-end-normally)下的流程是一样的。  

假使**开启了增量备份**，紧急模式下的流程如下：

1. 实例端直接**进行一次增量备份**，并把该条增量备份记录**上报给主控端**。  

没错，只有一步，够快吧！

### 实例端向主控端说再见

至此，实例端已经结束了所有流程，向主控端说“再见”。  

> “再见”的实现方式是**以`1001`状态**关闭`WebSocket`连接，连接关闭理由是`Goodbye`。  

### 主控端进行收尾工作

在接收到实例端的“再见”后，主控端会进行收尾工作：

1. 主控端进入`2500`状态

2. 销毁当前项目下**创建的实例**

3. 销毁实例对应的**SSH密匙对**

4. 回到**最初的**`2000`状态

至此一整个流程就走完了喵！

## 一些建议


## License

Under [Apache-2.0 License](./LICENSE).