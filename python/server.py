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
from mySecrets import hexToStr, toHex
from myBasics import strToBase64, base64ToStr
from html import escape as html_escape


def escape_html(s: str) -> str:
    s = html_escape(s)
    return s.replace('\n', ' ').replace(' ', '&nbsp;')


BASE64_HEADER = 'data:application/javascript;base64,'


def generate_html(base_path: str,
                  graph_title: str = 'The title of graph',
                  x_title: str = 'The description of X',
                  y_title: str = 'The description of Y',
                  x_start_ms: int = 0,
                  x_step_ms: int = 1000,
                  data_point_num: int = None,  # required
                  variable_num: int = None,  # required
                  variable_names: list[str] = None,  # generate automatically if it's None
                  label_colors: list[str] = None,  # generate automatically if it's None
                  data_server_url: str = None,  # required
                  max_whole_level_cache_size: int = 0) -> str:
    if (not base_path.endswith('/')):
        base_path += '/'
    with open(base_path + 'main.html', 'r') as f:
        html = f.read()
        html = html.replace("$jtc.py-html-graph.graph-title$", escape_html(graph_title)) \
                   .replace("$jtc.py-html-graph.x-title$", escape_html(x_title)) \
                   .replace("$jtc.py-html-graph.y-title$", escape_html(y_title))
    with open(base_path + 'chart.js', 'r') as f:
        chartjs = f.read()
    with open(base_path + 'main.js', 'r') as f:
        js = f.read()
        js = js.replace("'$jtc.py-html-graph.data-point-num$'", str(data_point_num)) \
               .replace("'$jtc.py-html-graph.variable-num$'", str(variable_num)) \
               .replace("'$jtc.py-html-graph.variable-names$'", str(variable_names)) \
               .replace("'$jtc.py-html-graph.label-colors$'", str(label_colors)) \
               .replace("'$jtc.py-html-graph.data-server-base-url$'", f'"{data_server_url}"')
    with open(base_path + 'reset.css', 'r') as f:
        reset = f.read()
    with open(base_path + 'main.css', 'r') as f:
        css = f.read()
    with open(base_path + 'style.js', 'r') as f:
        stylejs = f.read()
    with open(base_path + 'axis.js', 'r') as f:
        axisjs = f.read()
        axisjs = axisjs.replace("'$jtc.py-html-graph.x-start-ms$'", str(x_start_ms)) \
                       .replace("'$jtc.py-html-graph.x-step-ms$'", str(x_step_ms))
    with open(base_path + 'cache_worker.js', 'r') as f:
        worker = f.read()
        worker = worker.replace("'$jtc.py-html-graph.max-whole-level-cache-size$'", str(max_whole_level_cache_size))
    with open(base_path + 'http.js', 'r') as f:
        httpjs = f.read()
    httpjs = strToBase64(httpjs)
    worker = worker.replace("'$jtc.py-html-graph.inside.httpjs$'", f"'{httpjs}'")
    worker = strToBase64(worker)
    js = js.replace("'$jtc.py-html-graph.inside.cacheworkerbase64$'", f"'{worker}'")
    html = html.replace('<script src="chart.js"></script>', f'<script>{chartjs}</script>')
    html = html.replace('<script src="main.js"></script>', f'<script src="{BASE64_HEADER+strToBase64(js)}"></script>')
    html = html.replace('<link rel="stylesheet" href="reset.css">', f'<style>{reset}</style>')
    html = html.replace('<link rel="stylesheet" href="main.css">', f'<style>{css}</style>')
    html = html.replace('<script src="style.js"></script>', f'<script src="{BASE64_HEADER+strToBase64(stylejs)}"></script>')
    html = html.replace('<script src="axis.js"></script>', f'<script src="{BASE64_HEADER+strToBase64(axisjs)}"></script>')
    return html


class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
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
        html = generate_html('../html',
                             data_point_num=50000000,
                             variable_num=10,
                             variable_names=['Name '+str(i) for i in range(1, 11)],
                             label_colors=['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
                             data_server_url='http://127.0.0.1:9012/preload_data')
        html = html.encode('utf-8')
        self.send_header('Content-Length', len(html))
        self.end_headers()
        self.wfile.write(html)
        print('index.html')
        return

    def log_message(self, *args) -> None:
        pass
    
    def send_cache_header(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
    
    def send_cors_header(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Access-Control-Allow-Origin', '*')

server = ThreadingHTTPServer(('0.0.0.0', 9010), Request)
start_new_thread(server.serve_forever, ())
print(f'Listening at 0.0.0.0:9010, http://127.0.0.1:9010')
while True:
    sleep(10)
