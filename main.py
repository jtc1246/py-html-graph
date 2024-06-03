import numpy as np
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from _thread import start_new_thread
from time import sleep
from mySecrets import hexToStr
import json
from math import floor
from myBasics import binToBase64


def generate_data_10_500k() -> np.ndarray:
    array = np.zeros((10, 500000), dtype=np.float32)
    # generator = random.Random(0)
    for i in range(0, 10):
        generator = random.Random(1246 + i)
        S0 = 100
        mu = 0.0002
        sigma = 0.01
        dt = 1 / 252
        currentValue = S0
        array[i][0] = currentValue
        for j in range(1, 500000):
            randomShock = generator.random() * 2 - 1
            drift = (mu - 0.5 * sigma * sigma) * dt
            diffusion = sigma * randomShock * np.sqrt(dt)
            currentValue = currentValue * np.exp(drift + diffusion)
            array[i][j] = currentValue
    return array


def generate_data_10_5m() -> np.ndarray:
    array = np.zeros((10, 5000000), dtype=np.float32)
    # generator = random.Random(0)
    for i in range(0, 10):
        generator = random.Random(1246 + i)
        S0 = 100
        mu = 0.0002
        sigma = 0.01
        dt = 1 / 252
        currentValue = S0
        array[i][0] = currentValue
        for j in range(1, 5000000):
            randomShock = generator.random() * 2 - 1
            drift = (mu - 0.5 * sigma * sigma) * dt
            diffusion = sigma * randomShock * np.sqrt(dt)
            currentValue = currentValue * np.exp(drift + diffusion)
            array[i][j] = currentValue
    return array

def generate_data_10_50m() -> np.ndarray:
    array = np.zeros((10, 50000000), dtype=np.float32)
    # generator = random.Random(0)
    for i in range(0, 10):
        generator = random.Random(1246 + i)
        S0 = 100
        mu = 0.0002
        sigma = 0.01
        dt = 1 / 252
        currentValue = S0
        array[i][0] = currentValue
        for j in range(1, 50000000):
            randomShock = generator.random() * 2 - 1
            drift = (mu - 0.5 * sigma * sigma) * dt
            diffusion = sigma * randomShock * np.sqrt(dt)
            currentValue = currentValue * np.exp(drift + diffusion)
            array[i][j] = currentValue
    return array


def to_big_endian(arr: np.ndarray) -> bytes:
    return arr.byteswap().tobytes()


# data = to_big_endian(generate_data_10_500k())
# with open('data/10_500k.bin', 'wb') as f:
#     f.write(data)

# data = to_big_endian(generate_data_10_5m())
# with open('data/10_5m.bin', 'wb') as f:
#     f.write(data)

# data = to_big_endian(generate_data_10_50m())
# with open('data/10_50m.bin', 'wb') as f:
#     f.write(data)

with open('data/10_500k.bin', 'rb') as f:
    data_10_500k = f.read()

with open('data/10_5m.bin', 'rb') as f:
    data_10_5m = f.read()

with open('data/10_50m.bin', 'rb') as f:
    data_10_50m = f.read()

array_10_50m = np.frombuffer(data_10_50m, dtype=np.float32).reshape((10, 50000000)).byteswap()
print(array_10_50m[:,0])
array_min = np.min(array_10_50m)
array_max = np.max(array_10_50m)
print(array_min, array_max)
array_10_50m=array_10_50m.byteswap()

class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        if (path not in ('/data_10_500k', '/data_10_5m', '/data_10_50m')
            and not path.startswith('/window_data/')
            and not path.startswith('/preload_data/')):
            print(404)
            self.send_response(404)
            self.send_header('Content-Length', 13)
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'404 Not Found')
            return
        if (path == '/data_10_500k'):
            print('data_10_500k')
            self.send_response(200)
            self.send_header('Content-Length', len(data_10_500k))
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data_10_500k)
            return
        if (path == '/data_10_5m'):
            print('data_10_5m')
            self.send_response(200)
            self.send_header('Content-Length', len(data_10_5m))
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data_10_5m)
            return
        if (path == '/data_10_50m'):
            print('data_10_50m')
            self.send_response(200)
            self.send_header('Content-Length', len(data_10_50m))
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data_10_50m)
            return
        # for load at update
        if(path.startswith('/window_data/')):
            if(path[13:] == 'minmax'):
                print('at update: minmax')
                a=array_min.byteswap().tobytes()
                b=array_max.byteswap().tobytes()
                data = binToBase64(a+b)
                self.send_response(200)
                self.send_header('Content-Length', len(data))
                self.send_header('Connection', 'keep-alive')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data.encode('utf-8'))
                return
            data = path[13:]
            json_data = json.loads(hexToStr(data))
            print('at update: ', end='')
            print(json_data)
            start = json_data['start']
            end = json_data['end']
            step = json_data['step']
            selected = []
            for i in range(start, end, step):
                selected.append(i)
            if(selected[0]<0):
                selected[0]=0
            if(selected[-1]>array_10_50m.shape[1]-1):
                selected[-1]=array_10_50m.shape[1]-1
            array = array_10_50m[:, selected]
            data = array.tobytes()
            data = binToBase64(data)
            self.send_response(200)
            self.send_header('Content-Length', len(data))
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data.encode('utf-8'))
            return
        # for preload and cache
        if(path.startswith('/preload_data/')):
            if(path[14:] == 'minmax'):
                print('preload: minmax')
                a=array_min.byteswap().tobytes()
                b=array_max.byteswap().tobytes()
                data = binToBase64(a+b)
                self.send_response(200)
                self.send_header('Content-Length', len(data))
                self.send_header('Connection', 'keep-alive')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data.encode('utf-8'))
                return
            data = path[14:]
            json_data = json.loads(hexToStr(data))
            print('preload: ', end='')
            print(json_data)
            start = json_data['start']
            end = json_data['end']
            step = json_data['step']
            selected = []
            for i in range(start, end, step):
                selected.append(i)
            if(selected[0]<0):
                selected[0]=0
            if(selected[-1]>array_10_50m.shape[1]-1):
                selected[-1]=array_10_50m.shape[1]-1
            array = array_10_50m[:, selected]
            data = array.tobytes()
            # data = binToBase64(data)
            self.send_response(200)
            self.send_header('Content-Length', len(data))
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)
            return

    def log_message(self,*args) -> None:
        pass


server = ThreadingHTTPServer(('0.0.0.0', 9012), Request)
start_new_thread(server.serve_forever, ())
print('Server started')
while True:
    sleep(10)
