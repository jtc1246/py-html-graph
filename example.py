from py_html_graph import start_forward_server
from py_html_graph import GraphServer
import numpy as np
from time import time


with open('./data/10_50m.bin', 'rb') as f:
    data_10_50m = f.read()
array_10_50m = np.frombuffer(data_10_50m, dtype=np.float32).reshape((10, 50000000)).byteswap()
del data_10_50m

server = GraphServer(9010, 9012)
server.start()
server.add_graph('jtc', array_10_50m, 'column', 
                    x_start_ms=int(time()*1000), x_step_ms=200, 
                    x_title='Time', y_title='Price', title='Price comparison',
                    label_colors='STD', label_names=['BTC', 'ETH', 'BNB', 'ADA', 'DOGE', 'XRP', 'DOT', 'UNI', 'SOL', 'LTC'])
server.add_graph('mygraph', array_10_50m[0:6,0:20000000], 'column')
server.add_graph('tmp', array_10_50m[0:6,0:20000000].T, 'row')
server.add_graph('test4', np.zeros((100,10000), dtype=np.float32), 'column')
# server.wait_forever()

start_forward_server(9011)
