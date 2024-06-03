/* 通信协议: 
   1. main_to_worker_signal 用于 主线程向 worker 发送信号, worker_to_main_signal 用于 worker 向主
      线程发送信号, signal 非 0 即代表有信号, 每次接收到信号之后, 要把 对方的 signal 设置成 0
   2. main_to_worker -1 用于初次的配对, 仅测试是否能成功通信, 不含有实际信息, worker 需要回复 signal -1
   3. main_to_worker -2 用于初始化, 获取基本信息, 比如 最大值、最小值, worker 回复 -2
   4. main_to_worker 负的其它值, 用于实际获取数据 (值是json字符串长度的相反数), worker 回复 bytes 长
      度 (一定大于0) 
   5. 创建时 主线程需要postMessage 共享的 arraybuffer, worker postMessage仅告知主线程创建成功
   6. 主线程中修改了 signal 之后需要调用 Atomics.notify, worker中修改了不用, 主线程通过 while 循环获取
   7. shared_bytes 用于 worker 向主线程传回结果, 和主线程中输入命令, 主线程会写入 json 字符串, 
      worker 写入二进制数据, 在当前协议下, 不会同时写入或读取, 不需要用 Atomics
*/

var cached_data = {};
var shared_bytes = null; // 长度为 1MB, Uint8Array
var main_to_worker_signal = null; // 长度为 4, Int32Array
var worker_to_main_signal = null; // 长度为 4, Int32Array
var base_url; // 获取数据的链接


var access_data = async (start, end, step, window_size) => {
    // 这里写入 shared_bytes, 返回长度
    var json_data = {
        start: start,
        end: end,
        step: step
    };
    json_data = stringToHex(JSON.stringify(json_data));
    var url = base_url + '/' + json_data;

    var response_data = await new Promise((resolve, reject) => {
        var request = new XMLHttpRequest();
        request.open('GET', url, true); // true 使其异步
        request.responseType = 'arraybuffer';
        request.onload = function () {
            resolve(request.response);
        };
        request.onerror = function () {
            reject(new Error('Network error'));
        };
        request.send();
    });

    var response_length = response_data.byteLength;
    shared_bytes.set(new Uint8Array(response_data), 0);
    return response_length;
};



var main_msg_listener = async (value) => {
    var this_value = Atomics.load(main_to_worker_signal, 0);
    var returned_value = 0;
    try {
        if (this_value === -1) {
            returned_value = -1;
        } else if (this_value === -2) {
            // TODO: change this to async, and retry when failed
            var request = new XMLHttpRequest();
            request.open('GET', base_url + '/minmax', false);
            request.send();
            var response_data = base64ToArrayBuffer(request.responseText);
            var responseArray = new Uint8Array(response_data);
            shared_bytes.set(responseArray);
            returned_value = -2;
        } else if (this_value <= -3) {
            var sub_array = shared_bytes.subarray(0, -this_value);
            var sub_array_buffer = new ArrayBuffer(-this_value);
            var sub_array = new Uint8Array(sub_array_buffer);
            sub_array.set(shared_bytes.subarray(0, -this_value));
            var json_data = JSON.parse(new TextDecoder().decode(sub_array));
            var start = json_data.start;
            var end = json_data.end;
            var step = json_data.step;
            var window_size = json_data.window_size;
            returned_value = await access_data(start, end, step, window_size);
        } else {
            throw "Unknown signal: " + this_value;
        }
    } catch (e) {
        console.log(e);
        returned_value = -5;
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
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function stringToHex(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let hex = '';
    for (let byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}