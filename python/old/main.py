import numpy as np
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from _thread import start_new_thread
from time import sleep
from mySecrets import hexToStr, toHex
import json
from math import floor
from myBasics import binToBase64
import ssl


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

# with open('data/10_500k.bin', 'rb') as f:
#     data_10_500k = f.read()

# with open('data/10_5m.bin', 'rb') as f:
#     data_10_5m = f.read()

with open('../../data/10_50m.bin', 'rb') as f:
    data_10_50m = f.read()

array_10_50m = np.frombuffer(data_10_50m, dtype=np.float32).reshape((10, 50000000)).byteswap()
print(array_10_50m[:, 0])
array_min = np.min(array_10_50m)
array_max = np.max(array_10_50m)
print(array_min, array_max)
array_10_50m = array_10_50m.byteswap()


class Request(BaseHTTPRequestHandler):
    def process_404(self):
        print(404)
        self.send_response(404)
        self.send_header('Content-Length', 13)
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'404 Not Found')
        return
    
    def process_minmax(self):
        print('minmax')
        a = array_min.byteswap().tobytes()
        b = array_max.byteswap().tobytes()
        data = binToBase64(a + b)
        self.send_response(200)
        self.send_header('Content-Length', len(data))
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data.encode('utf-8'))
        return
    
    def process_one_request(self):
        data = self.path[14:]
        json_data = json.loads(hexToStr(data))
        print('single-request: ', end='')
        print(json_data)
        start = json_data['start']
        end = json_data['end']
        step = json_data['step']
        transpose = 'tr' in json_data
        selected = []
        for i in range(start, end, step):
            selected.append(i)
        if (selected[0] < 0):
            selected[0] = 0
        if (selected[-1] > array_10_50m.shape[1] - 1):
            selected[-1] = array_10_50m.shape[1] - 1
        array = array_10_50m[:, selected]
        if(transpose):
            array = array.T
        data = array.tobytes()
        # data = binToBase64(data)
        self.send_response(200)
        self.send_header('Content-Length', len(data))
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)
        return
    
    def process_batch(self):
        print('batch request')
        json_data = json.loads(hexToStr(self.path[20:]))
        results = []
        lengths = []
        total_length = 0
        for a in json_data:
            current_request = json.loads(hexToStr(a))
            start = current_request['start']
            end = current_request['end']
            step = current_request['step']
            selected = []
            for i in range(start, end, step):
                selected.append(i)
            if (selected[0] < 0):
                selected[0] = 0
            if (selected[-1] > array_10_50m.shape[1] - 1):
                selected[-1] = array_10_50m.shape[1] - 1
            array = array_10_50m[:, selected]
            data = array.T.tobytes()
            results.append(data)
            lengths.append(len(data))
            total_length += len(data)
        data = b''.join(results)
        length_header = toHex(json.dumps(lengths))
        self.send_response(200)
        self.send_header('Content-Length', total_length)
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Parts-Length', length_header)
        self.send_header('Access-Control-Expose-Headers', 'Parts-Length')
        self.end_headers()
        self.wfile.write(data)
        return
    
    def do_GET(self):
        path = self.path
        if (not path.startswith('/preload_data/')):
            self.process_404()
            return
        if (path[14:] == 'minmax'):
            self.process_minmax()
            return
        if(path[14:].startswith('batch/')):
            self.process_batch()
            return
        self.process_one_request()

    def log_message(self, *args) -> None:
        pass

cert_path = './html/certificate.crt'
key_path = './html/private.key'

server = ThreadingHTTPServer(('0.0.0.0', 9012), Request)
# server.socket = ssl.wrap_socket(server.socket, certfile=cert_path, keyfile=key_path, server_side=True)
start_new_thread(server.serve_forever, ())
print('Server started')
while True:
    sleep(10)
