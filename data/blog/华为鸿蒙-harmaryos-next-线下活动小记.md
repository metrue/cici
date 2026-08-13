---
title: 华为鸿蒙 HarmaryOS Next 线下活动小记
date: 2024-04-21T05:58:06.454Z
---

# 华为鸿蒙 HarmaryOS Next 线下活动小记

![54A32E3D-418E-496C-BAC8-1DC951BB8764_1_102_o](https://github.com/metrue/picx-images-hosting/raw/master/54A32E3D-418E-496C-BAC8-1DC951BB8764_1_102_o.2h83p85e3m.webp)

## 偶然决定

很久都没有参加线下活动了，周末的时间基本上，要么陪小朋友运动，要么陪小朋友写作业或者准备比赛，要么陪夫人练车。很偶然的在朋友圈刷到华为鸿蒙的线下开发者活动，心血来潮就报名了，捡一捡线下开发的感觉，也是一个很好的了解鸿蒙生态的一个机会吧。

![Screenshot-2024-04-22-at-10](https://github.com/metrue/picx-images-hosting/raw/master/Screenshot-2024-04-22-at-10.07.27.7awyld9bmx.webp)

我甚至都没有详细看活动议程，甚至都没有想过是不是需要做一点准备，而本人也确实没有一点鸿蒙开发的经验，甚至 Android 开发也没有正经弄过，也就是维护两个小 iOS 应用。但是不妨碍我参加一个以鸿蒙为主题的开发者比赛活动呀，没准比赛中可以完成一个最小可用产品，顺利的开启自己的鸿蒙生涯呢。

## 活动当天

### 早上
周日和夫人安排好小朋友的学习和活动安排，提醒夫人关注好小朋友的事项安排重点之后，我就出发去活动了，原来活动在徐汇漕河泾的字节办公楼，我从杨浦江湾体育场这边过去，相当于从上海的北边到南边，还是蛮远。想到地铁还要转车，算了咖啡直接打车吧。

上了车想到如果要组队，要不就随机叫个朋友一起吧，所以发个消息给 @Chester ，Checster 也很干脆，一起来玩了。等我到场地时候，活动已经开始了，迟到了十几分钟。Chester 比我迟到更多了，我们完全没有注意到活动的议程，其实人家的流程还是紧凑的。

![5FAF4CFC-0DE3-4D44-A10A-44B03A134F3C_1_102_o](https://github.com/metrue/picx-images-hosting/raw/master/5FAF4CFC-0DE3-4D44-A10A-44B03A134F3C_1_102_o.1seu57ih4r.webp)

早上主要主办方和华为工作人员对活动和鸿蒙的一些介绍，我们两人在期间对于今天要做什么进行一些头脑风暴，"Cross OS HandOff"  这个想法很自然的就到我的脑海中，简单的讨论之后我们就决定做这个想法了。跨生态互操作，想想就很好玩，当然也想想就好难，不过我想着做一个PoC应该问题不大。

### 午餐

大约到了十二点多开始午餐，午餐很一般，略过.

### 下午

#### 设计

下午就是写代码的时间啦.  我们基本上采用了 "Demo Driven" 的开发方案。首先当然是定义我们的目标了。

**我的愿景:  移动设备用户在不同生态（iOS, Android, HarmonyOS等）的设备之间可以做到无缝的持续性操作.**

*场景1*: 比如我在的的 iPhone 手机上的记事本上正在创作，突然想要切换我的 HarmonyOS 笔记本上继续我的创作，键盘输入让我创作更快捷。这时候如果有了 Cross OS 的 HandOff, 它将自动把我 iPhone 上的记事本的状态变成 HarmonyOS 上记事本的应用状态，我直接在 HarmonyOS无缝的继续我的创作。

*场景2*: 比如我在的 HarmonyOS 的笔记本上上的地图软件上查询我到目的地路线，现在我准备出门打车，那么我就可以通过 Cross OS HandOff 的功能在我的 iOS iPhone 手机上的地图应用继续的操作。

这些都是我最初想法想达到的愿景，但是想到现在也就是不到两个小时的时间了，我们如何实现一个 demo 来阐述我们的理念呢。其实要达到我们的目标，主要完成两个主要的部分:

> 为了更好的表达，我们把两个不同的生态上的应用分别进行简单的编号.  在运行着 iOS 系统的 iPhone 设备的某应用程序，我们编号 A. 在运行着 HarmonyOS 系统的鸿蒙设备的某同类型的应用程序，我们编号 B. 

* 应用状态快照

为了实现 A 到 B 的 HandOff, 我们需要先将此刻的 A 的状态进行快照。

* 数据传输

为了实现在 B 上继续用户在 A 上的操作，我们需要将上一步的 A 的应用程序状态快照传输到 B 的设备上。

* 应用状态恢复

当运行在 B 的设备收到 A 的状态快照之后，将状态快照恢复成 B 可以识别的状态，并且应用到 B 应用上。

但是很显然，在两个小时里我们是无法完成一个完善的方案的，所以我们最后定下来一个方案实现 PoC 并且很大概率可以完成现场 demo 的方案。

> 两个设备通过局域网进行通信，然后可以选择一个 Mac 应用，在Mac 进行一些一系列操作之后，然后我们转移到 HarmonyOS 设备上时，我们可以在同一个应用（或者同类型）的应用继续我们之前在 Mac 上的工作，保持完整的持续性.

这样我们就很完整的展示我们的概念，**然而**现实环境还是残酷，[^7b0daa3b-0af8-450f-824d-52aea73be8f7-1714018784523]在现场华为工程师的协助下，我们仍然没有办法成功在我们的 Mac 上能够完成 DevEcho - Studio 上运行一个 HarmonyOS 的模拟器，所以为了在短暂时间内有一个像样的 demo，我们选择一个简单的场景:

> 我在我的 Mac 上运行一个剪贴板管理 uPaste，我的队友也在他的 Mac 上运行这个 uPaste, 然后我会在我的 Mac 上进行一系列的复制粘贴操作，在不依赖 Mac 系统的内置同步功能的情况下，这些操作会自动在另外一台 Mac 的 uPaste 应用上自动同步.

#### 实现

* 数据传输

我们俩对于网络部分的知识确实有些捉襟见肘，想着无论是基于蓝牙，还是 WiFi 都可以，至少不能直接使用公网来传输数据。简单搜索一通之后，我们感觉无论是使用 WiFi Direct 还是蓝牙，感觉我们都无法这两个小时内 demo 出完整的流程，所以我们决定：直接在同一个局域网内，两个设备通过 Socket 来进行数据通信. 

* 应用数据状态发送

因为我们选择了最简单的剪贴板管理应用，所以应用状态就就很简单了: 用户当前的剪贴板内容.  所以我们只需要在适当的时候（用户进行 HandOff 操作的时候）进行一个剪贴板内容发送即可.

* 应用数据状态恢复

而在目标设备上，我们只需要将接收到剪贴板数据，写入到当前设备的剪贴板即可。

这样这个演示的流程就简单可控了，在清楚阐述我们的设计思路的同时也确保最低概率的演示翻车.

所以整个演示就变成了几段非常简单的代码而已。

监听并且收到数据之后直接写入剪贴板. 

```py
import socket

class Server:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    def start(self):
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen()
        while True:
            client_socket, client_address = self.server_socket.accept()
            self.handle_client(client_socket)

    def handle_client(self, client_socket):
        while True:
            data = client_socket.recv(1024).decode()
            if not data:
                break
        client_socket.close()

if __name__ == "__main__":
    HOST = '172.20.10.15'  # Listen on all available interfaces
    PORT = 8080
    server = Server(HOST, PORT)
    server.start()

```

持续从剪贴板读取数据，如果有变化通过 socket 发送剪贴板内容。

```py
import socket
import subprocess

def get_clipboard_content():
    process = subprocess.Popen(['pbpaste'], stdout=subprocess.PIPE)
    output, _ = process.communicate()
    return output.decode('utf-8')

class Client:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    def send_message(self, message):
        self.client_socket.connect((self.host, self.port))
        self.client_socket.sendall(message.encode())
        self.client_socket.close()

if __name__ == "__main__":
    HOST = '172.20.10.5'  # IP address of the receiver
    PORT = 8080

    tmp = get_clipboard_content()
    while True:
        source = get_clipboard_content()
        if source and source != tmp:
            client = Client(HOST, PORT)
            client.send_message(source)
            tmp = source

```

上面的代码就是当时我们 demo 所使用的代码，你可能会发现非常多的改进点，但是这就是 demo，让流程走起来比代码的完善更重要，一切的改动的出发点应该都是让 demo 更加完整流畅，能让观众和评审更容易理解和参与。


#### Demo

可能是周末写字楼物业不开空调还是怎么的，活动的会议室非常的热，我们只能跑到外面的开放空间写代码。我们一个个的解决掉项目中的问题，感觉似乎从演示的层面上差不多的时候，工作人员跑过来说“你们怎么还在这呢，演示都开始了”，后来我们才了解到，原来最终的作品其实不需要一个可以运行的代码，只要一份演示的 ppt 即可，并且演示是需要报名的，只有十个名额，显然像我们这样，人家都开始演示，我们都还在调试代码的团队，显然就没有机会了。

然而在我们回到会议室，看着别人的演示，觉得既没有特别惊艳的创意，也没有硬核的技术展示的时候，我们琢磨着全部参加完整个流程似乎太晚回家了，打算伺机离开的时候，评委说：“我们再增加两个展示名额吧”，看来评委也希望可以看到更多的项目，更多的可能性。我们想着既然做都做了，展示成果，也算今天没有白来。所以立即就举手上台展示了.

玩完没有想到，展示的效果还挺好，现场观众的反应和评委的评价都比较的积极，还是蛮开心。

> 小插曲: 不知道为啥，当我们使用场地的局域网的时候，socket 连接不成功，最后我们只能通过我们手机开热点形式来完成我们的展示.

![9B1AFD7E-A216-4C74-A89F-1C24FBE0064F_1_102_o](https://github.com/metrue/picx-images-hosting/raw/master/9B1AFD7E-A216-4C74-A89F-1C24FBE0064F_1_102_o.45h80rrfe.webp)

#### 投票和获奖

万万没想想到，最后我们获得票数第二名的成绩，当然这也包括我们自己的投票😂，但是很开心，希望我们在后面的六月份的决赛中[^aC5taW5naGVAZ21haWwuY29t-1721555382700]，也可以也能收获幸运。

![CC35F46A-C5B7-4F35-96E5-7D27B6E52B44_1_102_o](https://github.com/metrue/picx-images-hosting/raw/master/CC35F46A-C5B7-4F35-96E5-7D27B6E52B44_1_102_o.60u1f17vuf.webp)



[^7b0daa3b-0af8-450f-824d-52aea73be8f7-1714018784523]: 华为如果可以在开发者体验方面再进一步，将极大有助于生态的繁荣.

[^aC5taW5naGVAZ21haWwuY29t-1721555382700]: 很可惜，由于客观原因，我们没有能前往东莞参加决赛.
