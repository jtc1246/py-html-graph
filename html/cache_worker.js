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

const CACHE_LOADED = 1;
const CACHE_REQUESTING = 2;
const CACHE_FREE = 3;

var required_cache_area = {}; // key 为 level, value 为 {start: xxx, end: xxx}
var unnecessary_cache_area = {}; // key 为 level, value 为 {start: xxx, end: xxx}
var cached_data = {};
var whole_level_caches = {};
var shared_bytes = null; // 长度为 1MB, Uint8Array
var main_to_worker_signal = null; // 长度为 4, Int32Array
var worker_to_main_signal = null; // 长度为 4, Int32Array
var BASE_URL; // 获取数据的链接
var TOTAL_DATA_POINTS;
var VARIABLE_NUM;

const MAX_CACHE_ALL_SIZE = 200 * 1000 * 1000; // 全部缓存的前几个 level, 最大的大小, 这是后期可设置的参数
var MAX_LEVEL = -1;
var MAX_CACHE_ALL_LEVEL = -1;

var current_request_start = -1;
var current_request_end = -1;
var current_request_step = -1;
var current_request_level = -1;
var current_window_max = -1;
var has_request = false;
var mouse_position = 0.5;
var current_request_promise_resolve = null;


var do_whole_level_cache = async () => {
    var current = MAX_LEVEL;
    for (; ;) {
        if (current < MAX_CACHE_ALL_LEVEL) {
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
        // TODO: 检查是否能用来完成当前的请求
        whole_level_caches[i] = new Uint8Array(response_data);
        if (has_request && current_request_level === i) {
            current_request_promise_resolve(1);
            has_request = false;
            current_request_promise_resolve = null;
        }
        current--;
    }
};


var cache_init = () => {
    MAX_LEVEL = Math.floor(Math.log2(TOTAL_DATA_POINTS / 40));
    if (MAX_LEVEL < 0) {
        MAX_LEVEL = 0;
    }
    MAX_CACHE_ALL_LEVEL = Math.floor(Math.log2(TOTAL_DATA_POINTS / (MAX_CACHE_ALL_SIZE / 4 / VARIABLE_NUM)));
    if (MAX_CACHE_ALL_LEVEL < 0) {
        MAX_CACHE_ALL_LEVEL = 0;
    }
    console.log("Max level: ", MAX_LEVEL);
    console.log("Max cache all level: ", MAX_CACHE_ALL_LEVEL);
    // for (var i = 0; i < MAX_LEVEL; i++) {
    //     cached_data[i] = [];
    // }
    do_whole_level_cache();
};

var get_new_required_range = () => {
    var new_range = {};
    var start = current_request_start - (current_request_end - current_request_start)
    var end = current_request_end + (current_request_end - current_request_start);
    start = Math.round(start / Math.pow(2, current_request_level));
    end = Math.round(end / Math.pow(2, current_request_level));
    new_range[current_request_level] = {
        start: start,
        end: end
    };
    for (var i = current_request_level - 1; i >= current_request_level - 4; i--) {
        if (i < 0) {
            break;
        }
        var mouse_value = current_request_start + mouse_position * (current_request_end - current_request_start);
        var start = mouse_value - (0.5+mouse_position) * window_max * Math.pow(2, i);
        var end = mouse_value + (1.5-mouse_position) * window_max * Math.pow(2, i);
        start = Math.round(start/Math.pow(2, i));
        end = Math.round(end/Math.pow(2, i));
        new_range[i] = {
            start: start,
            end: end
        };
    }
}

var update_cache = (mouse_move_only) => {
    if (current_request_level === -1) {
        // 这代表是图都没加载好的时候鼠标在移动, 什么都不要做
        return;
    }
}


var access_data_2 = async (start, end, step, window_size, window_max) => {
    current_request_start = start;
    current_request_end = end;
    current_request_step = step;
    current_window_max = window_max;
    var level = Math.round(Math.log2(step));
    current_request_level = level;
    has_request = true;
    var length = Math.floor((end - 1 - start) / step) + 1;
    var cache_start = Math.floor(start / step) + 1; // 开始的数据在 cache 中的位置
    if (level == 0) {
        cache_start = start;
    }
    // 1. 检查 whole_level_caches 是否能满足需求
    if (level >= MAX_CACHE_ALL_LEVEL && whole_level_caches[level] !== undefined) {
        var this_level = whole_level_caches[level];
        // var length = Math.floor((end - 1 - start) / step)+1;
        var response_bytes = shared_bytes;
        var cache_bytes = new Uint8Array(this_level);
        var cache_length = cache_bytes.length;
        var cache_point_num = cache_length / 4 / VARIABLE_NUM;
        // var cache_start = Math.floor(start / step)+1;
        // if (level == 0) {
        //     cache_start = start;
        // }
        var cache_end = cache_start + length; // actual end plus 1
        for (var i = 0; i < VARIABLE_NUM; i++) {
            var cache_start_byte = cache_point_num * 4 * i + 4 * cache_start;
            var byte_length = length * 4;
            var response_start_byte = i * length * 4;
            response_bytes.set(cache_bytes.subarray(cache_start_byte, cache_start_byte + byte_length), response_start_byte);
        }
        has_request = false;
        return length * 4 * VARIABLE_NUM;
    }
    // 2. 检查 cached_data 是否能满足需求
    // for (; cached_data[level].length !== 0;) {
    //     // 为了使用 break
    //     var part_num = cached_data[level].length;
    //     var found = false;
    //     var index;
    //     for (var i = 0; i < part_num; i++) {
    //         var this_part_start = cached_data[level][i].start;
    //         var this_part_end = cached_data[level][i].end;
    //         if (cache_start >= this_part_start && cache_start + length <= this_part_end) {
    //             found = true;
    //             index = i;
    //             break;
    //         }
    //     }
    //     if (found === false) {
    //         break;
    //     }
    //     var this_part_start = cached_data[level][index].start;
    //     var this_part_end = cached_data[level][index].end;
    //     var this_part_data = cached_data[level][index].data;  // Uint8Array
    //     var cache_length = this_part_data.length;
    //     var cache_point_num = cache_length / 4 / VARIABLE_NUM;
    //     cache_start -= this_part_start;
    //     for (var i = 0; i < VARIABLE_NUM; i++) {
    //         var cache_start_byte = cache_point_num * 4 * i + 4 * cache_start;
    //         var byte_length = length * 4;
    //         var response_start_byte = i * length * 4;
    //         response_bytes.set(this_part_data.subarray(cache_start_byte, cache_start_byte + byte_length), response_start_byte);
    //     }
    //     return length * 4 * VARIABLE_NUM;
    // }
    var json_data = {
        start: start,
        end: end,
        step: step
    };
    json_data = stringToHex(JSON.stringify(json_data));
    var url = BASE_URL + '/' + json_data;
    var response_data = await new Promise((resolve) => {
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.timeout = 50;
        var onerror = () => {
            console.log('onerror');
            var request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.responseType = 'arraybuffer';
            request.timeout = 50;
            request.onload = function () {
                console.log('onload');
                if (request.status === 200) {
                    resolve(request.response);
                } else {
                    onerror();
                }
            };
            request.onerror = onerror;
            request.ontimeout = onerror;
            request.send();
        }
        request.onload = function () {
            if (request.status === 200) {
                resolve(request.response);
            } else {
                onerror();
            }
        };
        request.onerror = onerror;
        request.ontimeout = onerror;
        request.send();
        current_request_promise_resolve = resolve;
    });
    // TODO: when timeout, not stop the previous request, just start a new request, whoever
    //       finished first can resolve
    var response_length = response_data.byteLength;
    shared_bytes.set(new Uint8Array(response_data), 0);
    has_request = false;
    current_request_promise_resolve = null;
    return response_length;
    // return await access_data(start, end, step, window_size);
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
            mouse_position = (this_value - 10000) / 10000;
            // console.log("Mouse position: ", mouse_position);
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
}


onmessage = (e) => {
    shared_bytes = new Uint8Array(e.data.shared_bytes);
    main_to_worker_signal = new Int32Array(e.data.m2w);
    worker_to_main_signal = new Int32Array(e.data.w2m);
    BASE_URL = e.data.base_url;
    TOTAL_DATA_POINTS = e.data.total_data_points;
    VARIABLE_NUM = e.data.variable_num;
    Atomics.waitAsync(main_to_worker_signal, 0, 0).value.then(main_msg_listener);
    cache_init();
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