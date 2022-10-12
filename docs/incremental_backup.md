# 增量备份

咱在这个项目（主要是实例端InsSide）中造了个简单的增量备份轮子，以尽最大可能地保证数据安全。  

## 配置

配置项位于`api_configs.ins_side.incremental_backup`下：

```js
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
```

## 目录结构示例

以上面这个**默认的配置**为例，增量备份的目录结构如下：

```bash
/root/increments # 增量备份的dest_dir
    │  .backup_init_flag # 增量备份初始化过了的标识
    │  backup-records.json # 现存的增量备份记录
    │  root-minecraft-world.json # 记录/root/minecraft/world目录中文件的最后修改日期
    │  root-minecraft-world_nether.json # 记录/root/minecraft/world_nether目录中文件的最后修改日期
    │  root-minecraft-world_the_end.json # 记录/root/minecraft/world_the_end目录中文件的最后修改日期
    │
    ├─backup # 增量备份进行所在的目录(仅在备份过程中不为空)
    │  ├─root-minecraft-world # /root/minecraft/world目录的增量备份
    │  │  │  copyMap.json # 记录备份文件和源文件的对应关系
    │  │  │  level.dat # 备份的文件
    │  │  │
    │  │  └─region # 备份的文件
    │  │          r.0.-4.mca
    │  │          r.1.-2.mca
    │  │          r.1.2.mca
    │  │
    │  ├─root-minecraft-world_nether
    │  │      copyMap.json
    │  │      level.dat
    │  │
    │  └─root-minecraft-world_the_end
    │          copyMap.json
    │          level.dat
    │          level.dat_old
    │
    └─restore # 还原增量备份过程进行所在的目录(仅在还原过程中不为空)
        ├─root-minecraft-world # 解压出来的/root/minecraft/world目录的增量备份
        │  │  copyMap.json
        │  │  level.dat
        │  │
        │  └─region
        │          r.0.-4.mca
        │          r.1.-2.mca
        │          r.1.2.mca
        │
        ├─root-minecraft-world_nether
        │      copyMap.json
        │      level.dat
        │
        └─root-minecraft-world_the_end
                copyMap.json
                level.dat
                level.dat_old
```

## 进行一次增量备份过程

> 前提：在实例端启动时[进行了初始化](../README.md#init-incremental-backup)。  
> 实际上只要`enable`设置为了`true`，就会在实例端启动时进行初始化，无需担忧。

在**Minecraft运行过程中**，每隔[一段时间](#incremental-backup-interval)，实例端会自动进行一次增量备份。

> 在[紧急模式](../README.md#urgently-end)下也会进行增量备份。  

1. 对于`src_dirs`中的**每个目录**：

    1. 深层扫描目录，记录所有文件的**最后修改时间**

    2. 将每个文件的**最后修改时间**与上一次备份时的**最后修改时间**进行比较。如果文件的最后修改时间改变了，就添加到待备份列表中。

    3. 处理待备份列表中的文件：

        1. 将文件从源目录复制到**相应的备份目录**中。

            > 比如`/root/minecraft/world`目录中的`regions/r.0.-4.mca`文件被修改了，那么就会将`/root/minecraft/world/regions/r.0.-4.mca`复制到`/root/increments/backup/root-minecraft-world/regions/r.0.-4.mca`中。

            > 目标目录如果不存在，会**自动创建**。

        2. 更新文件的**最后修改时间**。

            > 比如：`/root/minecraft/world`目录中的文件，文件的最新修改时间会写入`/root/increments/root-minecraft-world.json`中。

        3. 将文件的**相对路径与源绝对路径的映射关系**写入`copyMap.json`中。

            > 比如`/root/minecraft/world`目录中的`regions/r.0.-4.mca`文件，它的**相对路径与源绝对路径的映射关系**是：  
            &nbsp;&nbsp;`regions/r.0.-4.mca` -> `/root/minecraft/world/regions/r.0.-4.mca`  
            > 那么就将`["regions/r.0.-4.mca", "/root/minecraft/world/regions/r.0.-4.mca"]`写入copyMap中。

2. 将新的备份命名为`bk-<毫秒级时间戳>`，先记入**实例端本地的**增量备份记录文件`/root/increments/backup-records.json`。

3. 执行脚本`incremental_backup.scripts.backup`，压缩打包并上传**本次增量备份**。

    我为这一环节写的脚本是[`incre_backup.sh`](../scripts/incre_backup.sh)，它做的事是：  

    - 进入**备份目录**（配置项：`incremental_backup.dest_dir`）中的`backup`目录。
        > 比如默认配置是`/root/increments`，那么这一步就进入了`/root/increments/backup`目录。  

    - 该目录中的所有文件用`lz4`算法压缩，并用`tar`打包成`bk-<毫秒级时间戳>.tar.lz4`文件

    - 将上述压缩包上传到**对象储存**中

4. 增量备份成功上传，将**新的备份记录**回传给**主控端**。

5. **清空**备份目录（配置项：`incremental_backup.dest_dir`）中的`backup`目录。

    > 比如[目录结构示例](#目录结构示例)中的`/root/increments/backup`目录，完成一次备份恢复后就变成了空目录。

这便是创建一次增量备份的过程。

## 还原某个增量备份的过程

> 前提：在实例端启动时[进行了初始化](../README.md#init-incremental-backup)。  
> 实际上只要`enable`设置为了`true`，就会在实例端启动时进行初始化，无需担忧。

1. 得到要恢复的**备份名**（形如`bk-<毫秒级时间戳>`）  

2. 执行脚本`incremental_backup.scripts.restore`，下载**备份名**对应的压缩包文件并解压到**恢复目录**中。

    > 比如`incremental_backup.dest_dir`配置是`/root/increments`，那么这一步就解压到了`/root/increments/restore`这个**恢复目录**中。  

    我为这个环节写的脚本是[`incre_restore.sh`](../scripts/incre_restore.sh)，它做的事是：

    - 从对象储存的增量备份目录中下载`备份名.tar.lz4`  

    - 使用`lz4`和`tar`程序将`备份名.tar.lz4`解压到**恢复目录**（本例中是`/root/increments/restore`）中  

    > **这一步**中解压后解压目录的结构形如[目录结构示例](#目录结构示例)中的`/root/increments/restore`目录，可见和**进行增量备份时**的备份目录结构是一样的。

3. 扫描**恢复目录**下的**所有目录**（浅层）。

    > 比如[目录结构示例](#目录结构示例)中的`/root/increments/restore`目录，扫描出来的结果是`root-minecraft-world`, `root-minecraft-world_nether`, `root-minecraft-world_the_end`这三个目录。  

4. 针对**第三步**中扫描出来的**每个**目录执行这些操作：  

    1. 寻找此目录下的**路径映射关系文件**（`copyMap.json`），如果找不到则认为**备份文件损坏**，报错。（这种情况不应该出现！）  

        > 示例路径：`/root/increments/restore/root-minecraft-world/copyMap.json`

    2. 解析`copyMap.json`得到数组`copyMap`。

    3. 遍历`copyMap`中的每个元素  
    
        - 每个元素是一个代表路径映射关系的数组，形如：  

            ```
            ["regions/r.0.-4.mca", "/root/minecraft/world/regions/r.0.-4.mca"]
            ```

        - 将**当前目录路径**和**这个映射数组中的前一个相对路径**进行拼接，能得到**一个备份文件的绝对路径**。

            > 比如现在扫描到的目录是`/root/increments/restore/root-minecraft-world`，  
            > 和**上面这个映射数组的前一个相对路径**拼接后得到：
            > `/root/increments/restore/root-minecraft-world/regions/r.0.-4.mca`

        - 根据得到的备份文件绝对路径，复制备份文件到**映射数组中的后一个绝对路径**。  

            （如果目标所在目录不存在则会自动创建）

            > 接着上面的例子，这里就是复制`/root/increments/restore/root-minecraft-world/regions/r.0.-4.mca`  ->  `/root/minecraft/world/regions/r.0.-4.mca`

            > 如果`/root/minecraft/world/regions/`不存在，是会**自动创建**的。

5. 恢复备份完毕，清空**恢复目录**。

    > 比如[目录结构示例](#目录结构示例)中的`/root/increments/restore`目录，完成一次备份恢复后就变成了空目录。

这便是恢复**一个增量备份文件**的过程。

> 增量备份自**上一次全量备份**后往往不止有一个备份文件，这个时候只需要根据[**增量备份记录文件**](#增量备份文件记录文件)中列出的**增量备份列表**（已经按**时间戳升序**排序），**重复执行**上面的恢复步骤即可。  

## 增量备份文件记录文件

