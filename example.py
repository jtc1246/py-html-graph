from py_html_graph import GraphServer
import numpy as np
from time import time

def set_data(array, num):
    r1 = np.random.normal(loc=1.0000005, scale=0.001, size=(num - 1, 10)).astype(np.float32)
    r2 = np.random.normal(loc=1.000002, scale=0.002, size=(num - 1,)).astype(np.float32)
    factors = r1 / 2 + r2.reshape(-1, 1) / 2
    array[1:, :] = array[0, :] * np.cumprod(factors, axis=0)

num = 50000000

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
