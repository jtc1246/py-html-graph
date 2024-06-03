/* 通信协议: 
   1. main_to_worker_signal 用于 主线程向 worker 发送信号, worker_to_main_signal 用于 worker 向主
      线程发送信号, signal 非 0 即代表有信号, 每次接收到信号之后, 要把 对方的 signal 设置成 0
   2. main_to_worker -1 用于初次的配对, 仅测试是否能成功通信, 不含有实际信息, worker 需要回复 signal -1
   3. main_to_worker -2 用于初始化, 获取基本信息, 比如 最大值、最小值, worker 回复 -2
   4. main_to_worker -3 用于实际获取数据, worker 回复 bytes 长度 (一定大于0) 
   5. 创建时 主线程需要postMessage 共享的 arraybuffer, worker postMessage仅告知主线程创建成功
   6. 主线程中修改了 signal 之后需要调用 Atomics.notify, worker中修改了不用, 主线程通过 while 循环获取
   7. shared_bytes 只会在 worker 中写入, 主线程中读取, 主线程不会向其写入
*/

var cached_data = {};
var shared_bytes = null; // 长度为 1MB, Uint8Array
var main_to_worker_signal = null; // 长度为 4, Int32Array
var worker_to_main_signal = null; // 长度为 4, Int32Array
var base_url; // 获取数据的链接

var access_data = (start, end, step, window_size) => {
    // 这里写入 shared_bytes, 返回长度
}


var main_msg_listener = (value) => {
    var this_value = Atomics.load(main_to_worker_signal, 0);
    var returned_value = 0;
    if (this_value === -1) {
        returned_value = -1;
    } else if (this_value === -2) {
        var request = new XMLHttpRequest();
        request.open('GET', base_url + '/minmax', false);
        request.send();
        var response_data = base64ToArrayBuffer(request.responseText);
        var responseArray = new Uint8Array(response_data);
        shared_bytes.set(responseArray);
        returned_value = -2;
    } else if (this_value === -3) {
    }
    Atomics.store(main_to_worker_signal, 0, 0);
    Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    Atomics.store(worker_to_main_signal, 0, returned_value);
}


onmessage = (e) => {
    shared_bytes = new Uint8Array(e.data.shared_bytes);
    main_to_worker_signal = new Int32Array(e.data.m2w);
    worker_to_main_signal = new Int32Array(e.data.w2m);
    base_url = e.data.base_url;
    Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    postMessage(0);
};


// =============================== Util Functions ===============================
function base64ToArrayBuffer(base64) {
    // 解码 base64 字符串
    const binaryString = atob(base64);

    // 创建 Uint8Array 并填充数据
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // 将 Uint8Array 转换为 ArrayBuffer
    return bytes.buffer;
}