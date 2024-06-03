# safari 中 web worker 出现问题的原因分析

1. 首先, safari 在web worker中的报错和输出有时会不显示, 给测试带来困难.
2. 主要原因是不能用同步的 XMLHttpRequest 和 await, 这两个去掉了就正常.
3. sharedArrayBuffer 和 Atomtics.waitAsync 是正常的.
4. 关于 await, 非常复杂. 在 fetch 前加 await 可以, 但是在 remote_print 前加 await 不行.
