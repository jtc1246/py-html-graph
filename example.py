from py_html_graph import GraphServer
import numpy as np
from time import time

has_numba = True
try:
    from numba import jit
except:
    has_numba = False

if has_numba:
    num = 50000000

    @jit(nopython=True)
    def set_data(array, num):
        for i in range(0, num - 1):
            array[i + 1, :] = array[i, :] * (
                np.random.normal(loc=1.0000005, scale=0.001, size=10).reshape((1, 10)) / 2 +
                np.random.normal(loc=1.000002, scale=0.002) / 2
            )

    # useless, just compile and warm up
    tmp_data = np.zeros((500000, 10), dtype=np.float32)
    tmp_data[0, :] = 100
    set_data(tmp_data, 500000)
else:
    print('numba is not installed, this is not required. It can just speed up example data generation, irrelevant to the actual usage of py-html-graph library. If you want to generate more example data and faster, you can install it by running "pip install numba". Note that this is not mandatory.')
    num = 2000000

    def set_data(array, num):
        for i in range(0, num - 1):
            array[i + 1, :] = array[i, :] * (
                np.random.normal(loc=1.0000005, scale=0.001, size=10).reshape((1, 10)) / 2 +
                np.random.normal(loc=1.000002, scale=0.002) / 2
            )


data = np.zeros((num, 10), dtype=np.float32)
data[0, :] = 100
print('Creating example data ...')
set_data(data, num)
print('Example data created.\n')

server = GraphServer(9010, 9012)
server.start()
server.add_graph('jtc', data, 'row',
                 x_start_ms=int(time() * 1000), x_step_ms=200,
                 x_title='Time', y_title='Price', title='Price comparison',
                 label_colors='STD', label_names=['BTC', 'ETH', 'BNB', 'ADA', 'DOGE', 'XRP', 'DOT', 'UNI', 'SOL', 'LTC'])
server.add_graph('mygraph', data[0:int(num * 0.4), 0:6], 'row')
server.add_graph('tmp', data[0:int(num * 0.4), 0:6].T, 'column')
server.wait_forever()
