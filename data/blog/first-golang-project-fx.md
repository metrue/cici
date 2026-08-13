---
title: 用 Golang 写一个支持各种编程语言的 serverless 框架
date: 2017-10-22T17:42:13.233Z
external_discussions:
  - platform: hackernews
    url: https://news.ycombinator.com/item?id=15686661
  - platform: v2ex
    url: https://v2ex.com/t/406259
  - platform: reddit
    url: https://www.reddit.com/r/programming/comments/7su688/fx_is_a_homemade_faas_tool_like_aws_lambda/
---

# 用 Golang 写一个支持各种编程语言的 serverless 框架

## 前言

fx 是我在 [Go Hack](http://gohack2017.golangfoundation.org/)的一个小作品，Go Hack 是一个以Go语言为主要编程语言的黑客马拉松比赛。虽然我和我队友两人都是写JavaScript的前端工程师, 以Golang 零基础参加这次比赛，不过很开心我们完成了fx，也喜欢上 Golang 这门语言.

读了那么多年书，写了那么久的代码，如果说有什么概念是深入骨髓的，只能说是”函数“了。虽然在数学上和编程上，“函数”这个词有很大的不一样的，但是有一点上它们是类似:

```
接受输入（可能为空值），然后进行处理，最后输出处理结果。
```

我们几乎可以用这个概念来描述所有的行为. 比如我们可以用下面的函数的来描述我们 fx 的诞生过程：

```
函数 f = Go Hack (以 Golang 为项目编程语言的黑客马拉松活动)
输入 input = [两个Go语言零基础的JavaScript工程师，两台Macbook，很多很多的功能饮料]
fx = f(input)
```

## fx 是什么

那么 fx 是什么呢，一句话来说就是 : fx 是一个可以把一个函数变成一个服务的工具.  一个简单的例子来说一下 fx 的功能吧. 比如你写好了很棒的函数 , 它是这样的:

func.js
```javascript
module.exports = (input) => {
  return parseInt(input.a, 10) + parseInt(input.b, 10)
}
```

它的作用就是计算两个数的和.  你把这个函数写在 `func.js` 这个文件里面。 这时候你希望可以将这个函数编程一个服务，对外提供一个 url 可以供外界访问.  但是想到 nginx, web server,  api gateway…, 你头有点大了。 现在你可以简单的这样做。

```shell
fx up func.js
```

如果一切没有什么问题，你可以得到一个url.

```shell
$ fx list

+------------+---------+---------------+
|     ID     |  STATE  |      URL      |
+------------+---------+---------------+
| ce925443d5 | running | 0.0.0.0:40549 |
+------------+---------+---------------+
```

访问你的服务试试看

```shell
$ curl -X POST 0.0.0.0:40549 -H "Content-Type: application/json" -d '{"a": 1, "b": 1}'
```

你会得到 `2`. 这说明你的函数已经变成了一个服务了。

## fx 如何工作

fx 有两个部分组成，fx server 和 fx client, 最开始的 client 和 server 基于 websocket 进行通信，所有的交互基于 websocket message 来进行, 当时选择 websocket 的原因是因为其简单，能够快速验证我们的想法。当项目做完了演示了之后放到了 [Github](https://github.com/metrue/fx) 之后, 收到了很多的反馈，有同学提出了可以采用 RPC 架构来做，gRPC 如雷贯耳很长时间，就是没有机会去实践，但是后来工作一直很忙，所以没有能够及时完成迁移，然后社区的力量是强大的，一个就职于意大利FBK的哥们发Email和我说，他想参与维护 fx, 我简单看了他的Github主页了之后，就直接把他放到了 collaborator   list 去了，后来他直接发了一个很大的 [Pull Request](https://github.com/metrue/fx/pull/100/files)过来，就是用 gRPC 替换了 websocket 的，我当然就很开心的做了merge.

所以现在的 fx 是一个基于 gRPC 框架的工具. 提供三个核心功能:

```shell
Usage:
  $ fx up   func1 func2 ...       deploy a function or a group of functions
  $ fx down func1 func2 ...       destroy a function or a group of functions
  $ fx list                       list deployed services
```

所以整个架构也很简单，fx up 会将 function 的定义内容传递给 fx server，fx server 接受到 function 的内容了之后，匹配到正确的 Dockerfile 和对应的构建镜像所需的资源, 然后会调用 Docker Engine 的 api 去构建相应的服务，最后把生成的服务的 URL 返回给客户端.

```shell
                up/ deploy a function to service
            -------------------------------------->
            <--------------------------------------
                down/ stop functions' services
            -------------------------------------->
fx client	<--------------------------------------   fx server

                list/ list deployed services
            -------------------------------------->
			<--------------------------------------
```

## fx 支持哪些编程语言

由于 fx 的一个服务的背后都是一个 Docker Container, 所以 fx 几乎可以支持所有的编程语言，由于精力有限，目前 fx 支持这些编程语言:
* Golang
* JavaScript/Node
* Ruby
* Python
* Java
* PHP
* Julia

## fx 的未来

啥未来，就是一个小工具而已。
