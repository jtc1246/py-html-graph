self.importScripts('data:application/javascript;base64,' + '$jtc.py-html-graph.inside.httpjs$');
/* 通信协议: 
   1. main_to_worker_signal 用于 主线程向 worker 发送信号, worker_to_main_signal 用于 worker 向主
      线程发送信号, signal 非 0 即代表有信号, 每次接收到信号之后, 要把 对方的 signal 设置成 0
   2. main_to_worker -1 用于初次的配对, 仅测试是否能成功通信, 不含有实际信息, worker 需要回复 signal -1
   3. main_to_worker -2 用于初始化, 获取基本信息, 比如 最大值、最小值, worker 回复 -2
   4. main_to_worker 负的其它值, 用于实际获取数据 (值是json字符串长度的相反数), worker 回复 bytes 长
      度 (一定大于0) 
   5. main_to_worker 10000~20000, 用于传输鼠标位置, 就用这个值表示, 没有其它数据, 10000 代表在最左边, 
      20000 表示在最右边, worker 需要回复 1
   6. main_to_worker 1 用于输出 worker 的统计信息, worker 自身输出, 不反回, 没有返回数据, worker 回复 1
   7. 创建时 主线程需要postMessage 共享的 arraybuffer, worker postMessage仅告知主线程创建成功
   8. 主线程中修改了 signal 之后需要调用 Atomics.notify, worker中修改了不用, 主线程通过 while 循环获取
   9. shared_bytes 用于 worker 向主线程传回结果, 和主线程中输入命令, 主线程会写入 json 字符串, 
      worker 写入二进制数据, 在当前协议下, 不会同时写入或读取, 不需要用 Atomics
*/

/** 缓存策略:
 *  1. 整体上缩放的优先级要高于左右移动, 缩放明显可以比左右移动更快
 *  2. 小于一定大小的前几个 level, 全部缓存
 *  3. 需要将每一个 level 每一个区域的数据根据与当前显示区域的"距离" (到达那需要操作的时间) 进行划分等级, 
 *     距离越近, 等级越低, 优先级越高
 *  4. 在一定等级 (暂定常数A) 以内, 如果没有就要缓存, 在一定等级之内 (暂定常数B), 有了不会删, 但是不会去单独缓存,
 *     超过B等级, 就会删除
 *  5. 缓存的数据库是一个字典, key 为 level, value: 一个数组, 范围是当前请求所有的 UNCNECESSARY 范围,
 *     创建时是空白的, 收到数据后在对应的位置写入, 并且还有一个 uint8array (每个数据点只占一个字节) 记录状态
 *  6. 上述的数组, 都是连续的二进制数据, 储存 float32, 就是 4 字节, 使用 Uint8Array
 *  7. 目前不会对同一批次中需要缓存的数据做优先级区分, 目前使用 http 请求, 将来可能会使用 websocket, 并进行优先级
 *     区分
 *  8. 每次请求数据, 如果缓存中有, 直接返回, 如果没有, 发送一个阻塞的 http 请求, 获取当前数据
 */

/** 缓存更新流程:
 *  一、针对用户请求新的数据 (即图表范围变化或鼠标移动)
 *  1. 每次请求之后, 重新计算整个缓存范围 (包括 required 和 unnecessary), 这时需同时保留旧的和新的
 *  2. 根据新旧缓存范围的变化, 移动 cached_data 中的数据 (主要是使index匹配)
 *  3. 检查 cached_data 中, 属于 required 但是状态为 FREE 的, 发出 http 请求, 并将状态改为 REQUESTING
 *     这里通过一个一个遍历 cached_data 中状态的 uint8array 实现, 整理出不同的连续范围
 * 
 *  二、针对每次收到 http 请求的数据
 *  1. 如果成功 (200), 根据缓存的范围, 将数据写入对应的位置, 并将状态改为 LOADED, 超出 UNNECESSARY 范围的丢弃
 *  2. 如果失败 (timeout error 非200), 把对应区域的状态标记为 FREE, 对该level重新进行 一(3) 的流程
 */

var shared_bytes = null; // 长度为 1MB, Uint8Array
var main_to_worker_signal = null; // 长度为 4, Int32Array
var worker_to_main_signal = null; // 长度为 4, Int32Array
var BASE_URL; // 获取数据的链接
var TOTAL_DATA_POINTS;
var VARIABLE_NUM;

const MAX_CACHE_ALL_SIZE = '$jtc.py-html-graph.max-whole-level-cache-size$'; // user-configurable
var current_request_promise_resolve = null;

var ongoing_requests = new Set();
var wasm = null;
var wasmMem = null;
var wasmBase64 = '$jtc.py-html-graph.inside.cache-wasm-base64$';

function loadWasm() {
    var wasmBytes = base64ToArrayBuffer(wasmBase64);
    var module = new WebAssembly.Module(wasmBytes);
    var instance = new WebAssembly.Instance(module, {
        env: { emscripten_notify_memory_growth: function() {} }
    });
    wasm = instance.exports;
    wasmMem = wasm.memory;
}

function wU8() { return new Uint8Array(wasmMem.buffer); }
function wI32(ptr, len) { return new Int32Array(wasmMem.buffer, ptr, len); }


var do_whole_level_cache = async () => {
    var max_level = wasm.get_max_level();
    var max_cache_all_level = wasm.get_max_cache_all_level();
    var current = max_level;
    for (; ;) {
        if (current < max_cache_all_level) {
            break;
        }
        var i = current;
        var step = Math.pow(2, i);
        var start, end;
        if (i == 0) {
            start = 0;
            end = TOTAL_DATA_POINTS;
        } else {
            start = - step / 2;
            end = fix_up_with_remainder(TOTAL_DATA_POINTS, step, step / 2) + 1;
        }
        var json_data = {
            start: start,
            end: end,
            step: step
        };
        json_data = stringToHex(JSON.stringify(json_data));
        var url = BASE_URL + '/' + json_data;
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        var estimated_size = (end - start) / step * VARIABLE_NUM * 4;
        var timeout = estimated_size / 10 / 1000; // ms, 10MB/s
        if (timeout < 200) {
            timeout = 200;
        }
        request.timeout = timeout;
        var response_data = await new Promise((resolve) => {
            request.onload = () => {
                if (request.status === 200) {
                    resolve(request.response);
                } else {
                    resolve(-1);
                }
            };
            request.onerror = () => {
                resolve(-1);
            };
            request.ontimeout = () => {
                resolve(-1);
            };
            request.send();
        });
        if (response_data === -1) {
            continue;
        }
        var ptr = wasm.alloc_whole_cache(i, response_data.byteLength);
        wU8().set(new Uint8Array(response_data), ptr);
        if (wasm.get_has_request() && wasm.get_current_level() === i) {
            current_request_promise_resolve(1);
            wasm.clear_request();
            current_request_promise_resolve = null;
        }
        current--;
    }
};


var create_request_callbacks = (request_, start_, end_, level_, step_, request_id_) => {
    var start = start_;
    var end = end_;
    var level = level_;
    var step = step_;
    var request = request_;
    var request_id = request_id_;
    function on_load(request) {
        if(request.status !== 200) return;
        if(!ongoing_requests.has(request_id)) return;
        ongoing_requests.delete(request_id);
        var data = new Uint8Array(request.response);
        var ptr = wasm.alloc_temp_input(data.byteLength);
        wU8().set(data, ptr);
        var fulfilled = wasm.write_preload_response(level, start, end, data.byteLength);
        if (fulfilled && current_request_promise_resolve) {
            current_request_promise_resolve(2);
            wasm.clear_request();
            current_request_promise_resolve = null;
        }
    }
    function fixed_interval_request() {
        if(!ongoing_requests.has(request_id)) return;
        var result = wasm.check_retry(level, start, end, step);
        if (!result) return;
        var ri = wI32(wasm.get_retry_info(), 4);
        var shared_start = ri[0], shared_end = ri[1], retry_start = ri[2], retry_end = ri[3];
        var json_data = { start: retry_start, end: retry_end, step: step, tr: 1 };
        json_data = stringToHex(JSON.stringify(json_data));
        var callback = create_request_callbacks(null, shared_start, shared_end, level, step, request_id);
        request_manager.add(json_data, callback, (shared_end - shared_start) * 4 * VARIABLE_NUM);
        wasm.retry_mark(level, shared_start, shared_end);
    }
    setTimeout(fixed_interval_request, 50);
    return on_load;
}


var access_data_2 = async (start, end, step, window_size, window_max) => {
    var t1 = performance.now();
    var result = wasm.access_data(start, end, step, window_size, window_max);
    if (result > 0) {
        // cache hit: 数据在 wasm io_buffer, 拷贝到 shared_bytes
        var io_ptr = wasm.get_io_buffer();
        shared_bytes.set(wU8().subarray(io_ptr, io_ptr + result));
        return result;
    }
    // cache miss
    var json_data = { start: start, end: end, step: step };
    json_data = stringToHex(JSON.stringify(json_data));
    var url = BASE_URL + '/' + json_data;
    var response_data = await new Promise((resolve) => {
        var request_id = generate_request_id();
        ongoing_requests.add(request_id);
        for (var i=0;i<3;i++){
            // 增加优先级
            create_fixed_interval_request(url, request_id, resolve);
        }
        current_request_promise_resolve = resolve;
    });
    if (response_data === 1 || response_data === 2) {
        // 被异步缓存请求满足
        var rv = wasm.access_from_cache(start, end, step, window_size, window_max);
        var io_ptr = wasm.get_io_buffer();
        shared_bytes.set(wU8().subarray(io_ptr, io_ptr + rv));
        wasm.clear_request();
        current_request_promise_resolve = null;
        console.log(`cache miss, took ${performance.now()-t1} ms`);
        return rv + 1048576;
    }
    // 直接 HTTP 响应
    var response_length = response_data.byteLength;
    var io_ptr = wasm.get_io_buffer();
    wU8().set(new Uint8Array(response_data), io_ptr);
    shared_bytes.set(wU8().subarray(io_ptr, io_ptr + response_length));
    wasm.store_miss_response(start, end, step, response_length);
    wasm.clear_request();
    current_request_promise_resolve = null;
    console.log(`cache miss, took ${performance.now()-t1} ms`);
    return response_length + 1048576;
};


var update_cache = (mouse_move_only) => {
    if (wasm.get_current_level() === -1) return;
    var count = wasm.update_cache_ranges(mouse_move_only ? 1 : 0);
    if (count === 0) return;
    var pptr = wasm.get_pending_ptr();
    var view = wI32(pptr, count * 6);
    for (var i = 0; i < count; i++) {
        var level = view[i*6];
        var act_start = view[i*6+1];
        var act_end = view[i*6+2];
        var step = view[i*6+3];
        var idx_start = view[i*6+4];
        var idx_end = view[i*6+5];
        var json_data = { start: act_start, end: act_end, step: step, tr: 1 };
        json_data = stringToHex(JSON.stringify(json_data));
        var request_id = generate_request_id();
        ongoing_requests.add(request_id);
        var callback = create_request_callbacks(null, idx_start, idx_end, level, step, request_id);
        request_manager.add(json_data, callback, (idx_end - idx_start) * 4 * VARIABLE_NUM);
        wasm.mark_requesting(level, idx_start, idx_end);
    }
    request_manager.flush();
};


var create_fixed_interval_request = (url_, request_id_, resolve_)=> {
    if(ongoing_requests.has(request_id_)===false){
        return;
    }
    var url = url_;
    var request_id = request_id_;
    var resolve = resolve_;
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
        if (request.status === 200) {
            if(ongoing_requests.has(request_id) === false){
                return;
            }
            ongoing_requests.delete(request_id);
            resolve(request.response);
        }
    };
    request.timeout = 500; // just to prevent last too long
    request.send();
    setTimeout(create_fixed_interval_request, 50, url, request_id, resolve);
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
            request.open('GET', BASE_URL + '/minmax', false);
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
            var window_max = json_data.window_max;
            returned_value = await access_data_2(start, end, step, window_size, window_max);
        } else if (this_value === 1) {
            // 主线程获取统计信息, 暂定
            returned_value = 1;
            console.log("Statistics printed.");
        } else if (this_value >= 10000) {
            wasm.set_mouse_pos((this_value - 10000) / 10000);
            returned_value = 1;
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
    if(this_value <= -3){
        update_cache(false);
    }
    if(this_value >= 10000){
        update_cache(true);
    }
}


onmessage = (e) => {
    shared_bytes = new Uint8Array(e.data.shared_bytes);
    main_to_worker_signal = new Int32Array(e.data.m2w);
    worker_to_main_signal = new Int32Array(e.data.w2m);
    BASE_URL = e.data.base_url;
    TOTAL_DATA_POINTS = e.data.total_data_points;
    VARIABLE_NUM = e.data.variable_num;
    loadWasm();
    wasm.init(TOTAL_DATA_POINTS, VARIABLE_NUM, MAX_CACHE_ALL_SIZE);
    Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    do_whole_level_cache();
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

var remote_print = (msg) => {
    var request = new XMLHttpRequest();
    msg = stringToHex(msg);
    var url = '/msg/' + msg;
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.send();
}

var fix_up_with_remainder = (num, multiple, remainder) => {
    var tmp = num % multiple;
    if (tmp <= remainder) {
        return Math.round(num - tmp + remainder);
    }
    return Math.round(num - tmp + multiple + remainder);
};

var generate_request_id = ()=>{
    var a = Math.floor(Math.random()*1000000000);
    var b = Math.floor(Math.random()*1000000000);
    var c = Math.floor(Math.random()*1000000000);
    return a.toString() + b.toString() + c.toString();
};

function hexToString(hexStr) {
    // Warning: ASCII only
    var str = '';
    for (var i = 0; i < hexStr.length; i += 2) {
        var hex = hexStr.substring(i, i + 2);
        str += String.fromCharCode(parseInt(hex, 16));
    }
    return str;
}
