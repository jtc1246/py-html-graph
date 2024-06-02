import numpy as np
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from _thread import start_new_thread
from time import sleep


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


def to_big_endian(arr: np.ndarray) -> bytes:
    return arr.byteswap().newbyteorder('>').tobytes()


# data = to_big_endian(generate_data_10_500k())
# with open('data/10_500k.bin', 'wb') as f:
#     f.write(data)

# data = to_big_endian(generate_data_10_5m())
# with open('data/10_5m.bin', 'wb') as f:
#     f.write(data)

with open('data/10_500k.bin', 'rb') as f:
    data_10_500k = f.read()

with open('data/10_5m.bin', 'rb') as f:
    data_10_5m = f.read()


class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        if (path not in ('/data_10_500k', '/data_10_5m')):
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

    def log_message(self,*args) -> None:
        pass


server = ThreadingHTTPServer(('0.0.0.0', 9012), Request)
start_new_thread(server.serve_forever, ())
while True:
    sleep(10)
