#!/bin/bash
# 启动服务器的部分
# 服务端启动指令
LAUNCH_CMD="java -Xms512M -Xmx3584M -jar paper*.jar nogui"
# 服务器进程退出后执行的指令，用于给check_process.sh打信号
END_CMD="echo 'end' > serverProcess.lost"

# 先进入Minecraft服务器的目录
cd $MC_DIR

# 同意eula
echo "eula=true" > eula.txt

sleep 1s

# 创建screen并分离(detach)
screen -L -dmS minecraft

sleep 1s

# 向screen内传输指令，启动服务端
screen -x -S minecraft -p 0 -X stuff "$LAUNCH_CMD ; $END_CMD \n"