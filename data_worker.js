importScripts('https://cdn.jsdelivr.net/npm/seedrandom');

function generateDataSequence(length, seed) {
    const S0 = 100; // 初始价格
    const mu = 0.0002; // 期望收益率
    const sigma = 0.01; // 波动率
    const dt = 1 / 252; // 时间步长，假设一年有252个交易日

    const myrng = new Math.seedrandom(`jtc${seed}`);
    const data = [];
    let currentValue = S0; // 初始价格
    data.push(currentValue);

    for (let i = 1; i < length; i++) {
        const randomShock = myrng() * 2 - 1; // -1 到 1 的随机数
        const drift = (mu - 0.5 * sigma * sigma) * dt;
        const diffusion = sigma * randomShock * Math.sqrt(dt);
        currentValue = currentValue * Math.exp(drift + diffusion);
        data.push(currentValue);
    }

    return data;
}

onmessage = function(e) {
    const { totalDataPoints, seed } = e.data;
    const data = generateDataSequence(totalDataPoints, seed);
    postMessage({ index: seed, data: data });
};
