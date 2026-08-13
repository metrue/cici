---
title: 深入浅出Redux的异步Actions
comments: true
date: 2016-10-17 09:13:34
updated: 2016-10-17 09:13:34
tags: Redux
categories: frontend
---

# 深入浅出Redux的异步Actions

Redux 是一个超棒的 state 容器，它几乎已经成为了 React 前端项目的必备 state 管理库，当然 Redux 可以用于任何应用 JavaScript 应用中，让我们看看这个很棒的库的代码情况吧。

```
	➜  src git:(master) ✗ pwd
	/Users/ming/Codes/redux/src
	➜  src git:(master) ✗ cloc .
				 7 text files.
				 7 unique files.
				 0 files ignored.

	http://cloc.sourceforge.net v 1.65  T=0.03 s (212.3 files/s, 18136.0 lines/s)
	-------------------------------------------------------------------------------
	Language                     files          blank        comment           code
	-------------------------------------------------------------------------------
	Javascript                       7             62            199            337
	-------------------------------------------------------------------------------
	SUM:                             7             62            199            337
	-------------------------------------------------------------------------------
```

这么棒的东西， 其实就几百行代码而已，不到两个小时你就几乎可以阅读完了，当然要深入理解其理念，还是需要一些时间的，让我们慢慢来。

### 基本

```
import { createStore } from 'redux'

function counter(state = 0, action) {
  switch (action.type) {
  case 'INCREMENT':
    return state + 1
  case 'DECREMENT':
    return state - 1
  default:
    return state
  }
}

let store = createStore(counter)

store.subscribe(() =>
  console.log(store.getState())
)
store.dispatch({ type: 'INCREMENT' })
// 1
store.dispatch({ type: 'INCREMENT' })
// 2
store.dispatch({ type: 'DECREMENT' })
```

这就是一个很完整的基于 Redux 的 JavaScript 应用了, 我们可以看到这是一个 Counter, 这个 Counter 可以进行 INCREMENT, DECREMENT 操作。 这不是就是简单的观察者模式吗，有人可能会说，是的，其实就是一个简单的观察者模式。还有一些有经验的工程师可能会说，这代码完全没有办法重用和拓展啊，别急，我们慢慢来。

让我们简单重构一下我们的代码吧:

reducer.js

```
const initState = 0;

export default function reducer(state = initState, action) {
  switch (action.type) {
  case 'INCREMENT':
    return state + 1
  case 'DECREMENT':
    return state - 1
  default:
    return state
  }
}
```

actions.js

```
export function incr() {
  return {
    type: 'INCREMENT',
  };
}

export function decr() {
  return {
    type: 'DECREMENT',
  }
}
```

main.js

```
import { createStore } from 'redux'

let store = createStore(counter)
store.subscribe(() =>
  console.log(store.getState())
)
store.dispatch({ type: 'INCREMENT' })
// 1
store.dispatch({ type: 'INCREMENT' })
// 2
store.dispatch({ type: 'DECREMENT' })
```
这样是不是感觉熟悉了很多呢，很多时候，简单遵循一些原则，代码就好看很多，比如这里的单一责任原则(Single responsibility principle).

从上面的代码可以看到，我们的 actions 全都是返回 plain object 的 function, 因为 store 只能 dispatch 纯的 Object, 而且携带这 type 属性。那么当我们有 actions 是的异步的怎么呢，比如我们有一个 ADD 的 action, 需要先去取到一个 value 然后才能进行添加操作，那么我们应该怎么做呢？

### 异步 actions

```
function add(value) {
  return {
    type: 'ADD',
    value,
  }
}

function fetchValue() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(2)
    }, 1000)
  })
}

function asyncAdd() {
  return function(dispatch) {
    fetchValue().then((val) => {
      dispatch(add(val))
    });
  }
}

```

可以看到，我们在 dispatch 这个 add action之前，需要先得到需要 add 的 value, 而这个 value 的获取是异步的。所以我需要 dispatch 的是 asyncAdd() 这个 action, 但是这个 action 返回不是一个 plain object, 而是一个 function, 那么我们怎么才能让 store 能够直接 dispatch 一个 function 呢，我们需要一个中间件。

Redux 提供了  redux-thunk  这个中间件来帮组我们做这件事情。

```
import { createStore, applyMiddleware } from 'redux'

const store = createStore(redux, applyMiddleware(thunk));
store.dispatch(asyncAdd());
```

可以看到我们 dispatch 了一个返回 function 的 action, 这个返回的 function 接收 dispatch 作为参数，在进行了异步操作之后, dispatch 一个 type 为了 ADD 的 action， 这个action 会被 reducer 捕捉然后更新 store. 一句话来总结 redux-thunk 的作用，那就是: 让 store 可以 dispatch 一个 function, 而不仅仅是 plain object.

对于简单的应用来, redux-thunk 也许可以完全胜任我们对于异步 action 的需求，但是它有着很明显的问题:

* actions 不在仅仅是一些返回 plain object 的function.
* dispatch 散落在不同的地方
* 测试变得复杂

是否可以有一种更友好进步的方式来管理异步 action 呢，所有 dispatch 出来的 action, 实际上都是广播形式，所有 store 的 listeners 都可以监听到，那么我们就可以让中间件去处理集中管理所有的异步操作, 等到特定结果的时候才 dispatch 相应的结果 action 出来，reducer 监听特定的 actions 去做 state 的更新操作, 这就是 redux-saga 这个第三方中间件的作用.

saga.js

```
import { takeEvery } from 'redux-saga'
import { put } from 'redux-saga/effects'

function* addWorker() {
  const value = yield call([fetchValue]);
  yield put({ type: 'ADD_SUCCESS', value });
}

function* addWatcher() {
  yield* takeEvery('ADD', addWorker);
}

export default addWatcher;
```

main.js

```
const sagaMiddleware = createSagaMiddleware();
const store = createStore(reducer, applyMiddleware(sagaMiddleware));
sagaMiddleware.run(addWatcher);
```

这个代码，可以让我们处理逻辑就变得十分清晰.

* watcher 监听目标 actions, 然后分发到相应的 worker 去执行
* worker 负责真正的异步操作，完成之后发布特定的 action 到 reducer
* actions 全部都是 plain object

而且我们的代码非常容易进行测试，actions 全是 plain object, 表征应用的行为，而 saga 负责异步调用, 其测试只需要测试 watcher 是否能正确监听 actions, 然后分发到正确的 worker, 而 worker 是否完成异步操作之后发布正确的 action.

当然这样做有一个不好的地方就是，所有的 action，都会同时被 saga 和 reducer 所监听，所以当你的 actions 设计不当，容易造成循环依赖。这个问题曾经在我的项目出现过一次，debug 起来较为麻烦, 所以在设计 actions 的时候一定要区分好那些 action 是 reducer 去 handle, 而那些 actions 是 saga 去 handle.

### 测试
其实关于 redux-saga 的测试，估计很少有人写，因为其实用 redux-saga 的其实应该不多, 更多人应该用 redux-thunk， 但其实 redux-thunk 很多人也没有写测试吧, 让我们来看看如何优雅的写好 redux-saga 的单元测试吧。

```
function constructExpectCallReturn(func, args) {
  return (
    {
      '@@redux-saga/IO': true,
      CALL: {
        context: {
          server: 'http://localhost:3000',
          baseURL: 'http://localhost:3000/v1',
        },
        fn: func,
        args,
      },
    }
  );
}

describe('watcher', () => {
  const action = { type: 'ADD' };

  it('should take on ADD action ', () => {
    actualYield = addWatcher.next().value;
    expectedYield = take(ADD, addWorker);
    expect(expectedYield).to.eql(actualYield);
  });

  it('should fork the saga handler with action', () => {
    expectedYield = fork(addWorker, action);
    actualYield = addWatcher.next(action).value;
    expect(expectedYield).to.eql(actualYield);
  });

  it('should return to capturing the FETCH action again', () => {
    actualYield = addWatcher.next().value;
    expectedYield = take(ADD, addWorker);
    expect(actualYield).to.eql(expectedYield);
  });
});

describe('worker', () => {
  it('should handle add', () => {
    const action = { type: ADD };
    const addIterator = addWorker(action);

    expectedYield = constructExpectCallReturn(fetchValue, []);
    actualYield = addIterator.next().value;
    expect(expectedYield).to.eql(actualYield);
  });
});

```

可以看到我们的代码完全是可测试, 而且责任分的十分清楚，模块化程度十分高。
上面的代码都是在非 React 的应用中，可以看出我的初衷，也就是 Redux 其实适用于所有的 JavaScript 应用，当然在 React 中，更是缺之不可啊，当然用这些优秀工具的同时，我们更重要的是理解其中的理念，知道这样做，也要知道为什么需要这样做，这样我们才能在没有这些东西的时候，我们如何解构我们的代码，甚至是做出自己的类 Redux, 类 redux-thunk, redux-saga 的工具。
