#!/bin/bash  
# 启动服务器的部分
# 服务端启动指令
LAUNCH_CMD="java -Xms512M -Xmx3584M -jar paper*.jar nogui"

# 先进入Minecraft服务器的目录
cd $MC_DIR

# 同意eula
echo "eula=true" > eula.txt

# 创建screen并分离(detach)
screen -L -dmS minecraft

# 向screen内传输指令，启动服务端
screen -x -S minecraft -p 0 -X stuff "$LAUNCH_CMD \n"