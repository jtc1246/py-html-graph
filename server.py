from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from _thread import start_new_thread
from time import sleep

from myBasics import strToBase64
import sys
import os

if(len(sys.argv)>=2 and sys.argv[1] == 'make'):
    with open('./html/chartjs_with_move.html', 'r') as f:
        html = f.read()
    with open('./html/chart.js', 'r') as f:
        chartjs = f.read()
    with open('./html/chartjs_with_move.js', 'r') as f:
        js = f.read()
    with open('./html/reset.css', 'r') as f:
        reset = f.read()
    with open('./html/chartjs_with_move.css', 'r') as f:
        css = f.read()
    with open('./html/style.js', 'r') as f:
        stylejs = f.read()
    with open('./html/axis.js', 'r') as f:
        axisjs = f.read()
    with open('./html/data_worker.js', 'r') as f:
        worker = f.read()
    worker = strToBase64(worker)
    html = html.replace('<script src="chart.js"></script>', f'<script>{chartjs}</script>')
    html = html.replace('<script src="chartjs_with_move.js"></script>', f'<script>{js}</script>')
    html = html.replace('<link rel="stylesheet" href="reset.css">', f'<style>{reset}</style>')
    html = html.replace('<link rel="stylesheet" href="chartjs_with_move.css">', f'<style>{css}</style>')
    html = html.replace('<script src="style.js"></script>', f'<script>{stylejs}</script>')
    html = html.replace('<script src="axis.js"></script>', f'<script>{axisjs}</script>')
    html = html.replace("'$workerb64$'", f"'{worker}'")
    with open('./html/index.html', 'w') as f:
        f.write(html)
    os._exit(0)


class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        if (path not in ['/', '/index.html']):
            print(404)
            self.send_response(404)
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
            self.end_headers()
            self.wfile.write(b'404 Not Found')
            return
        # if (path == '/data_worker.js'):
        #     print('data_worker.js')
        #     self.send_response(200)
        #     self.send_header('Content-Type', 'application/javascript')
        #     self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        #     self.send_header('Pragma', 'no-cache')
        #     self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
        #     self.end_headers()
        #     with open('./html/data_worker.js', 'rb') as f:
        #         self.wfile.write(f.read())
        #     return
        self.send_response(200)
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        with open('./html/chartjs_with_move.html', 'r') as f:
            html = f.read()
        with open('./html/chart.js', 'r') as f:
            chartjs = f.read()
        with open('./html/chartjs_with_move.js', 'r') as f:
            js = f.read()
        with open('./html/reset.css', 'r') as f:
            reset = f.read()
        with open('./html/chartjs_with_move.css', 'r') as f:
            css = f.read()
        with open('./html/style.js', 'r') as f:
            stylejs = f.read()
        with open('./html/axis.js', 'r') as f:
            axisjs = f.read()
        with open('./html/data_worker.js', 'r') as f:
            worker = f.read()
        worker = strToBase64(worker)
        html = html.replace('<script src="chart.js"></script>', f'<script>{chartjs}</script>')
        html = html.replace('<script src="chartjs_with_move.js"></script>', f'<script>{js}</script>')
        html = html.replace('<link rel="stylesheet" href="reset.css">', f'<style>{reset}</style>')
        html = html.replace('<link rel="stylesheet" href="chartjs_with_move.css">', f'<style>{css}</style>')
        html = html.replace('<script src="style.js"></script>', f'<script>{stylejs}</script>')
        html = html.replace('<script src="axis.js"></script>', f'<script>{axisjs}</script>')
        html = html.replace("'$workerb64$'", f"'{worker}'")
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
        print('index.html')
        return

    def log_message(self, format: str, *args: Any) -> None:
        pass


server = ThreadingHTTPServer(('0.0.0.0', 9010), Request)
start_new_thread(server.serve_forever, ())
print(f'Listening at 0.0.0.0:9010, http://127.0.0.1:9010')
while True:
    sleep(10)
