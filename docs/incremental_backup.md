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

## 目录结构

以上面这个**默认的配置**为例，增量备份的目录结构如下：

```bash
/root/increments # 增量备份的dest_dir
    │  .backup_init_flag # 增量备份初始化过了的标识
    │  backup-records.json # 现存的增量备份记录
    │  root-minecraft-world.json # 记录/root/minecraft/world目录中文件的最后修改日期
    │  root-minecraft-world_nether.json # 记录/root/minecraft/world_nether目录中文件的最后修改日期
    │  root-minecraft-world_the_end.json # 记录/root/minecraft/world_the_end目录中文件的最后修改日期
    │
    ├─backup # 增量备份进行的目录
    │  ├─root-minecraft-world # /root/minecraft/world目录的增量备份(仅在备份过程中不为空)
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
    └─restore
        ├─root-minecraft-world # 解压出来的/root/minecraft/world目录的增量备份(仅在还原备份过程中不为空)
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

## 备份过程

> 前提：在实例端启动时[进行了初始化](../README.md#init-incremental-backup)。  
> 实际上只要`enable`设置为了`true`，就会在实例端启动时进行初始化。

在**Minecraft运行过程中**，每隔[一段时间](#incremental-backup-interval)，实例端会自动进行一次增量备份。

> 在[紧急模式](../README.md#urgently-end)下也会进行增量备份。  

对于`src_dirs`中的每个目录：

1. 深层扫描目录，记录所有文件的**最后修改时间**

2. 将每个文件的**最后修改时间**与上一次备份时的**最后修改时间**进行比较。如果文件的最后修改时间改变了，就添加到待备份列表中。

3. 处理待备份列表中的文件：

    1. 将文件从源目录复制到相应的备份目录中。

        > 比如`/root/minecraft/world`目录中的`regions/r.0.-4.mca`文件被修改了，那么就会将`/root/minecraft/world/regions/r.0.-4.mca`复制到`/root/increments/backup/root-minecraft-world/regions/r.0.-4.mca`中。

    2. 更新文件的**最后修改时间**。

        > 比如：`/root/minecraft/world`目录中的文件，文件的最新修改时间会写入`/root/increments/root-minecraft-world.json`中。

    3. 将文件的**相对路径与源绝对路径的映射关系**写入`copyMap.json`中。

        > 比如`/root/minecraft/world`目录中的`regions/r.0.-4.mca`文件，它的**相对路径与源绝对路径的映射关系**是：  
        &nbsp;&nbsp;`regions/r.0.-4.mca` -> `/root/minecraft/world/regions/r.0.-4.mca`  
        > 那么就将`["regions/r.0.-4.mca", "/root/minecraft/world/regions/r.0.-4.mca"]`写入copyMap中。

4. 将新的备份命名为`bk-<毫秒级时间戳>`，先记入**实例端本地的**增量备份记录文件`/root/increments/backup-records.json`。

5. 