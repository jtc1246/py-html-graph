from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from _thread import start_new_thread
from time import sleep
from myBasics import strToBase64, base64ToStr
import sys
import os
from mySecrets import hexToStr
from threading import Lock
import ssl

USE_BUILT = False

header = 'data:application/javascript;base64,'

def generate_html(base_path: str) -> bytes:
    if USE_BUILT:
        with open('./html/index.html', 'rb') as f:
            return f.read()
    if(not base_path.endswith('/')):
        base_path += '/'
    with open(base_path + 'main.html', 'r') as f:
        html = f.read()
    with open(base_path + 'chart.js', 'r') as f:
        chartjs = f.read()
    with open(base_path + 'main.js', 'r') as f:
        js = f.read()
    with open(base_path + 'reset.css', 'r') as f:
        reset = f.read()
    with open(base_path + 'main.css', 'r') as f:
        css = f.read()
    with open(base_path + 'style.js', 'r') as f:
        stylejs = f.read()
    with open(base_path + 'axis.js', 'r') as f:
        axisjs = f.read()
    with open(base_path + 'cache_worker.js', 'r') as f:
        worker = f.read()
    with open(base_path + 'http.js', 'r') as f:
        httpjs = f.read()
    httpjs = strToBase64(httpjs)
    worker = worker.replace("'$httpjs$'", f"'{httpjs}'")
    worker = strToBase64(worker)
    js = js.replace("'$cacheworkerbase64$'", f"'{worker}'")
    html = html.replace('<script src="chart.js"></script>', f'<script>{chartjs}</script>')
    html = html.replace('<script src="main.js"></script>', f'<script src="{header+strToBase64(js)}"></script>')
    html = html.replace('<link rel="stylesheet" href="reset.css">', f'<style>{reset}</style>')
    html = html.replace('<link rel="stylesheet" href="main.css">', f'<style>{css}</style>')
    html = html.replace('<script src="style.js"></script>', f'<script src="{header+strToBase64(stylejs)}"></script>')
    html = html.replace('<script src="axis.js"></script>', f'<script src="{header+strToBase64(axisjs)}"></script>')
    html = html.encode('utf-8')
    return html

if(len(sys.argv)>=2 and sys.argv[1] == 'make'):
    html = generate_html('./html')
    with open('./html/index.html', 'wb') as f:
        f.write(html)
    os._exit(0)

print_lock = Lock()


class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        if(path.startswith('/msg/')):
            msg = path[5:]
            with print_lock:
                print(hexToStr(msg))
            self.send_response(200)
            self.send_header('Content-Length', 0)
            self.send_header('Connection', 'keep-alive')
            self.send_cors_header()
            self.end_headers()
            return
        if (path not in ['/', '/index.html']):
            print(404)
            self.send_response(404)
            self.send_cache_header()
            self.send_header('Content-Length', 13)
            self.send_header('Connection', 'keep-alive')
            self.send_cors_header()
            self.end_headers()
            self.wfile.write(b'404 Not Found')
            return
        self.send_response(200)
        self.send_cache_header()
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Connection', 'keep-alive')
        self.send_cors_header()
        html = generate_html('./html')
        self.send_header('Content-Length', len(html))
        self.end_headers()
        self.wfile.write(html)
        print('index.html')
        return

    def log_message(self, format: str, *args: Any) -> None:
        pass
    
    def send_cache_header(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
    
    def send_cors_header(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Access-Control-Allow-Origin', '*')

cert_path = './html/certificate.crt'
key_path = './html/private.key'

server = ThreadingHTTPServer(('0.0.0.0', 9010), Request)
# server.socket = ssl.wrap_socket(server.socket, certfile=cert_path, keyfile=key_path, server_side=True)

start_new_thread(server.serve_forever, ())
print(f'Listening at 0.0.0.0:9010, http://127.0.0.1:9010')
while True:
    sleep(10)
