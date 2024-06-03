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

function stringToHex(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let hex = '';
    for (let byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

var remote_print = (msg) => {
    // var request = new XMLHttpRequest();
    msg = stringToHex(msg);
    var url = 'http://127.0.0.1:9010/msg/' + msg;
    // var request = new XMLHttpRequest();
    // request.open('GET', url, true);
    // request.send();
    fetch(url);
}

var cached_data = {};
var shared_bytes = null; // 长度为 1MB, Uint8Array
var main_to_worker_signal = null; // 长度为 4, Int32Array
var worker_to_main_signal = null; // 长度为 4, Int32Array
var base_url; // 获取数据的链接

var listen_signal = () => {
    var value = Atomics.load(main_to_worker_signal, 0);
    if(value === 0){
        setTimeout(listen_signal, 1);
    } else {
        main_msg_listener(value);
    }
}

var access_data = (start, end, step, window_size) => {
    // 这里写入 shared_bytes, 返回长度
    var json_data = {
        start: start,
        end: end,
        step: step
    }
    json_data = stringToHex(JSON.stringify(json_data));
    var url = base_url + '/' + json_data;
    var request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.send();
    var response_data = request.responseText;
    response_data = base64ToArrayBuffer(response_data);
    var response_length = response_data.byteLength;
    var responseArray = new Uint8Array(response_data);
    shared_bytes.set(responseArray, 0);
    return response_length;
}


var main_msg_listener = (value) => {
    console.log('main_msg_listener');
    remote_print('main_msg_listener');
    var this_value = Atomics.load(main_to_worker_signal, 0);
    var returned_value = 0;
    postMessage(this_value);
    try{
    if (this_value === -1) {
        returned_value = -1;
    } else if (this_value === -2) {
        Atomics.store(main_to_worker_signal, 0, 0);
        Atomics.store(worker_to_main_signal, 0, -2);
        listen_signal();
        return;
        // TODO: change this to async, and retry when failed
        try{
        var request = new XMLHttpRequest();
        request.open('GET', base_url + '/minmax', false);
        request.send();
        var response_data = base64ToArrayBuffer(request.responseText);
        var responseArray = new Uint8Array(response_data);
        shared_bytes.set(responseArray);
        returned_value = -2;}
        catch(e){
            Atomics.store(worker_to_main_signal, 0, -2);
            postMessage(e);
            return;
        }
    } else if (this_value <= -3) {
        Atomics.store(main_to_worker_signal, 0, 0);
        Atomics.store(worker_to_main_signal, 0, 36040);
        listen_signal();
        return;
        var sub_array = shared_bytes.subarray(0, -this_value);
        var sub_array_buffer = new ArrayBuffer(-this_value);
        var sub_array = new Uint8Array(sub_array_buffer);
        sub_array.set(shared_bytes.subarray(0, -this_value));
        var json_data = JSON.parse(new TextDecoder().decode(sub_array));
        var start = json_data.start;
        var end = json_data.end;
        var step = json_data.step;
        var window_size = json_data.window_size;
        returned_value = access_data(start, end, step, window_size);
    } else {
        throw "Unknown signal: " + this_value;
    }
    } catch(e) {
        console.log(e);
        returned_value = -5;
    }
    Atomics.store(main_to_worker_signal, 0, 0);
    // Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    listen_signal();
    Atomics.store(worker_to_main_signal, 0, returned_value);
}


onmessage = (e) => {
    // remote_print('worker inited');
    console.log('worker inited');
    shared_bytes = new Uint8Array(e.data.shared_bytes);
    main_to_worker_signal = new Int32Array(e.data.m2w);
    worker_to_main_signal = new Int32Array(e.data.w2m);
    base_url = e.data.base_url;
    // Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    listen_signal();
    // console.log('worker inited done');
    postMessage(0);
    // console.log('worker inited done 2');
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

function stringToHex(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let hex = '';
    for (let byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

