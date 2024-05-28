const ACTION_IGNORE = 10000001;
const ACTION_LEFTRIGHT = 10000002;
const ACTION_UPDOWN = 10000003;

var t = 0;
const chart_element = document.getElementById('myChart');
const ctx = document.getElementById('myChart').getContext('2d');
var debug_element = document.getElementById('debug');
var debug2_element = document.getElementById('debug2');

// Generate sample data
const totalDataPoints = 5000000;
const window_min = 5; // 这里不想做限制，让用户自由缩放，但是为了防止程序出现问题，设一个最小值
const window_max = 1200; // 最多可以显示的点的数量，放大时减少数量，缩小时提高level，
_ = 0                    // 除非在最小级（没有更详细的数据），实际的现实量不可以小于这个的一半,
_ = 0                    // 暂定：初始情况为最小级，但是 window 大小为 3/4
let viewWindow = 900; // 实际渲染时使用的数据点的数量
let fake_window_size = 900; // 假设在不缩放的情况下，窗口内数据点的数量
const origin_window_size = 900; // 原始窗口大小, 需要通过这个和 ratio 计算 fake_window_size
let currentIndex = 0;
/* 每次更新先更新 fake_window_size (ratio只是用于内部计算的，这里不做讨论)
   1. 如果 fake_window_size 小于 window_max (大于 window_min)，level设成0，结束, viewWindow设为 fake_window_size
   2. 如果 fake_window_size 大于 window_max, 每次除以2, level加1，直到小于等于 window_max 
      (这里对等于的情况不做过多限制, 只要小于等于window_max、大于等于它的一半就行), 最后把值赋给 viewWindow
   3. 渲染时按照 2^level 作为步长选取数据点, 共有 viewWindow 个数据点
 */
let level = 0; // 缩放级别，必须大于等于0，代表从 2^level 个数据点中选一个显示
let ratio = 1.0;
var mouseX = 0;

document.addEventListener('mousemove', function (event) {
    mouseX = event.clientX;
});

window.addEventListener('wheel', function (event) {
    mouseX = event.clientX;
});

var data;

const numWorkers = 10;
const workers = [];
const dataSets = new Array(numWorkers).fill(null);
let completedWorkers = 0;
var all_finished = false;
var generating_start_time = performance.now();

// 创建一个函数来使用 Promise 等待所有 Worker 完成任务
function createData() {
    return new Promise((resolve) => {
        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker('data_worker.js');
            worker.onmessage = function (e) {
                const { index, data } = e.data;
                dataSets[index] = data;
                completedWorkers++;
                // if (dataSets.every(ds => ds !== null)) {
                //     resolve(dataSets);
                // }
                if (completedWorkers === numWorkers) {
                    resolve(dataSets);
                }
            };
            workers.push(worker);
        }

        workers.forEach((worker, index) => {
            worker.postMessage({ totalDataPoints: totalDataPoints, seed: index });
        });
    });
}

createData().then((dataSets) => {
    data = {
        labels: Array.from({ length: totalDataPoints }, (_, i) => i),
        datasets: dataSets.map((data, i) => ({
            label: `Variable ${i + 1}`,
            data: data
        }))
    };
    all_finished = true;
    console.log(`Time to generate data: ${performance.now() - generating_start_time} ms`);
    updateChart();
    element.addEventListener('wheel', handle_wheel, { passive: false });
    window.addEventListener('resize', updateChart);
});

let myChart;
var fps_datas = [];
var last_update_time = 0;

function slice(arr, start, end_plus_one, step) {
    var result = [];
    if(end_plus_one > arr.length) {
        end_plus_one = arr.length;
    }
    for (var i = start; i < end_plus_one; i += step) {
        result.push(arr[i]);
    }
    return result;
}


function createChart() {
    debug2_element.innerHTML = `currentIndex: ${currentIndex}<br>fake_window_size: ${fake_window_size}<br>viewWindow: ${viewWindow}<br>level: ${level}<br>ratio: ${ratio}`;
    var step = Math.pow(2, level);
    var start = Math.floor(currentIndex);
    var end_plus_one = Math.floor(currentIndex + fake_window_size + 2*step);
    const config = {
        type: 'line',
        data: {
            // labels: data.labels.slice(Math.floor(currentIndex), Math.floor(currentIndex + viewWindow+2)),
            labels: slice(data.labels, start, end_plus_one, step),
            datasets: data.datasets.map(dataset => ({
                ...dataset,
                // data: dataset.data.slice(Math.floor(currentIndex), Math.floor(currentIndex + viewWindow+2)),
                data: slice(dataset.data, start, end_plus_one, step),
                pointRadius: 0,
                borderWidth: chart_element.clientHeight / 300,
                tension: 0,
                borderJoinStyle: 'round'
            }))
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false  // 不显示图例
                },
                tooltip: {
                    enabled: false  // 关闭工具提示
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: (currentIndex),
                    max: (currentIndex + fake_window_size),
                    display: false
                },
                y: {
                    display: false,
                    // 设置 y
                    min: 98,
                    max: 102
                }
            },
            interaction: {
                mode: null  // 禁用鼠标悬停显示数据点信息
            }
        }
    };
    return new Chart(ctx, config);
}


// Function to update the chart view window by recreating the chart
function updateChart() {
    // var t1 = performance.now();
    if (myChart) {
        myChart.destroy();
    }
    myChart = createChart();
    // console.log(`${performance.now() - t1} ms`);
    var time = performance.now() - t;
    console.log(`${time} ms`);
    if (time > 500) {
        t = performance.now();
        return;
    }
    fps_datas.push(time);
    if (fps_datas.length > 10) {
        fps_datas.shift();
    }
    if (performance.now() - last_update_time > 150) {
        last_update_time = performance.now();
        var sum = 0;
        for (var i = 0; i < fps_datas.length; i++) {
            sum += fps_datas[i];
        }
        time = sum / fps_datas.length;
        var fps = 1000 / time;
        var e = document.getElementById("fps");
        e.innerHTML = `FPS: ${fps.toFixed(2)}`;
    }
    t = performance.now();
}


function handle_wheel(event) {
    event.preventDefault();
    var y = event.deltaY;
    var x = event.deltaX;
    var action = -1;
    if (y === 0) {
        action = ACTION_LEFTRIGHT;
    } else if (x === 0) {
        action = ACTION_UPDOWN;
    } else if (Math.abs(y) >= 3 * Math.abs(x)) {
        action = ACTION_UPDOWN;
    } else if (Math.abs(x) >= 3 * Math.abs(y)) {
        action = ACTION_LEFTRIGHT;
    } else {
        action = ACTION_IGNORE;
    }
    if (action === ACTION_IGNORE) {
        console.log(`Ignored, x: ${x}, y: ${y}`);
        return;
    }
    if (action === ACTION_LEFTRIGHT) {
        console.log(`Left/Right, x: ${x}, y: ${y}`);
        currentIndex += x * fake_window_size / 1000;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - fake_window_size) {
            currentIndex = totalDataPoints - fake_window_size;
        }
    }
    if (action === ACTION_UPDOWN) {
        console.log(`Up/Down, x: ${x}, y: ${y}`);
        ratio *= Math.pow(1.01, y);
        // if (ratio >= 1.5) {
        //     ratio = 1.5;
        // }
        // if (ratio <= 0.1) {
        //     ratio = 0.1;
        // }
        var prev_fake_window_size = fake_window_size;
        fake_window_size = origin_window_size * ratio;
        if(fake_window_size < window_min) {
            fake_window_size = window_min;
            ratio = fake_window_size / origin_window_size;
        }
        if(fake_window_size > totalDataPoints) {
            fake_window_size = totalDataPoints;
            ratio = fake_window_size / origin_window_size;
        }
        var mouse_x = getMousePosition();
        var left_ratio = (mouse_x - currentIndex) / prev_fake_window_size;
        // viewWindow = window_max * ratio;
        currentIndex = mouse_x - fake_window_size * left_ratio;
        if (currentIndex < 0) {
            currentIndex = 0;
        }
        if (currentIndex > totalDataPoints - fake_window_size) {
            currentIndex = totalDataPoints - fake_window_size;
        }
        // 开始处理 level 和 viewWindow, 因为实际上前面只是计算范围, 
        // 和实际渲染完全没关系, currentIndex 可以先计算好
        level = 0;
        viewWindow = fake_window_size;
        while (viewWindow > window_max) {
            viewWindow /= 2;
            level++;
        }
    }
    debug_element.innerHTML = `currentIndex: ${currentIndex}<br>fake_window_size: ${fake_window_size}<br>viewWindow: ${viewWindow}<br>level: ${level}<br>ratio: ${ratio}`;
    updateChart();
}

var element = document.getElementById('myChart');

// element.addEventListener('wheel', handle_wheel, { passive: false });
// window.addEventListener('resize', updateChart);

function getMousePosition() {
    const canvas = document.getElementById('myChart');
    const rect = canvas.getBoundingClientRect();
    const mouse_X = mouseX - rect.left;
    const xValue = myChart.scales.x.getValueForPixel(mouse_X);
    // console.log(xValue);
    return xValue;
}

