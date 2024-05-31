/* 计划 (y坐标值):
   1. 在网页中加入选择和输入框, 可以选择科学记数法或小数, 并输入有效数字位数
   2. 但是暂时先不实现这个, 先按照最简单的实现, 证明可行性
   3. 更高级的方法 (比如去掉几个0、以最小值为基准记录变化量(或百分比)等), 不会考虑, 这应该是用户端的事
   4. 默认 (未选择) 是显示两位小数
 */

const Y_TYPE_UNSELECTED = 11000001;
const Y_TYPE_SCIENTIFIC = 11000002;
const Y_TYPE_DECIMAL = 11000003;

var y_type = Y_TYPE_UNSELECTED;
var y_sci_digits = 3; // 有效位数, 包含小数点前的
var y_dec_digits = 2; // 小数位数

var y_range_prev_min = 0;
var y_range_prev_max = 0;

/* Y 的间距:
   1. 分为 0.1 0.2 0.25 0.5 (*10^n) 等级
   2. 选择可以让间距数大于等于 5 的最大间距 (直接用差除以间距, 不考虑两端、是否显示等因素)
   3. 这样可以保证间距数在 5 - 10 之间
 */

var delete_y_values_scales = () => {
    var y_axis = document.getElementById("y");
    var children = y_axis.children;
    for (var i = children.length - 1; i >= 0; i--) {
        if (children[i].classList.contains('y-js')) {
            y_axis.removeChild(children[i]);
        }
    }
}

var calc_y_interval = (min, max) => {
    var diff = max - min;
    var max_interval = diff / 5;
    var tmp = toScientificNotation(max_interval);
    var main = tmp[0];
    var decimal_digits = tmp[1];
    var l = -1;
    if (main >= 5) {
        l = 5;
    } else if (main >= 2.5) {
        l = 2.5;
    } else if (main >= 2) {
        l = 2;
    } else {
        l = 1;
    }
    var interval = l * Math.pow(10, decimal_digits);
    return interval;
};

var get_chart_height_in_vw = () => {
    var chart = document.getElementById("myChart");
    var height = chart.clientHeight;
    var window_width = document.querySelector('main').clientWidth;
    var vw = height / window_width * 100;
    // console.log(`window_width: ${window_width}`);
    // console.log(`vw: ${vw}`);
    return vw;
}

var encode_value = (num) => {
    if(y_type === Y_TYPE_UNSELECTED){
        return num.toFixed(2);
    }
    if(y_type === Y_TYPE_DECIMAL){
        return num.toFixed(y_dec_digits);
    }
    if(y_type === Y_TYPE_SCIENTIFIC){
        return num.toExponential(y_sci_digits-1).replace('+', '');
    }
}

var set_y_value = (min, max) => {
    // document.getElementById('y-top-value').innerHTML = max.toFixed(2);
    // document.getElementById('y-bottom-value').innerHTML = min.toFixed(2);
    // or it will be completely continuous, no space
    document.getElementById('y-top-value').innerHTML = encode_value(max)+'<br>';
    document.getElementById('y-bottom-value').innerHTML = encode_value(min)+'<br>';
    var interval = calc_y_interval(min, max);
    var start = Math.floor(min / interval) + 1;
    var end = Math.floor(max / interval);
    var num = (max - min) / interval;
    if (start * interval - min < interval * 0.5) {
        start += 1
    }
    if (max - end * interval < interval * 0.5) {
        end -= 1
    }
    delete_y_values_scales();
    var height_in_vw = get_chart_height_in_vw();
    var y_axis = document.getElementById("y");
    var offset;
    if (start * interval - min < max - end * interval) {
        offset = -0.75
    } else {
        offset = 0.1
    }
    var bottom_value = document.getElementById('y-bottom-value'); // must put it at last
    y_axis.removeChild(bottom_value);
    for (var i = end; i >= start; i--) {
        // for selection order, use reverse order
        var value = i * interval;
        var distance_to_top = (max - value) / (max - min) * height_in_vw;
        // 刻度线的距离是多少就是多少
        // 数据值的距离, 如果想要在上方, 是 (距离 - 0.75vw), 如果想要在下方, 是 (距离 + 0.1vw)
        var value_element = document.createElement('p');
        var scale_element = document.createElement('div');
        value_element.classList.add('y-value');
        scale_element.classList.add('y-scale');
        value_element.classList.add('y-js');
        scale_element.classList.add('y-js');
        scale_element.style.top = `${distance_to_top}vw`;
        value_element.style.top = `${distance_to_top + offset}vw`;
        // value_element.innerHTML = value.toFixed(2);
        value_element.innerHTML = encode_value(value)+'<br>';
        y_axis.appendChild(value_element);
        y_axis.appendChild(scale_element);
    }
    y_axis.appendChild(bottom_value);
    y_range_prev_max = max;
    y_range_prev_min = min;
}

function toScientificNotation(num) {
    // 将数字转换为科学记数法字符串
    const sciString = num.toExponential();

    // 分割科学记数法字符串，得到系数和指数部分
    const [coefficient, exponent] = sciString.split('e');

    // 转换系数和指数为数值
    const coeffNum = parseFloat(coefficient);
    const expNum = parseInt(exponent);

    // 返回两个数值
    return [coeffNum, expNum];
}

var update_y_value = () => {
    if(y_type === Y_TYPE_UNSELECTED){
        return;
    }
    if(y_digits_input.value.length === 0){
        return;
    }
    var digits = Number(y_digits_input.value);
    if(Number.isNaN(digits)){
        return;
    }
    digits = Math.round(digits);
    if(y_type === Y_TYPE_SCIENTIFIC){
        y_sci_digits = digits+1;
    }
    if(y_type === Y_TYPE_DECIMAL){
        y_dec_digits = digits;
    }
    set_y_value(y_range_prev_min, y_range_prev_max);
}

var to_decimal = () =>{
    y_type = Y_TYPE_DECIMAL;
    update_y_value();
}

var to_scientific = () =>{
    y_type = Y_TYPE_SCIENTIFIC;
    update_y_value();
}

var y_digits_input = document.getElementById('y-digits');
y_digits_input.addEventListener('input',()=>{
    console.log('y_digits_input changed');
    console.log(y_digits_input.value);
    update_y_value();
});
