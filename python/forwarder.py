from htmls import forwarder_html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from _thread import start_new_thread
from time import sleep

class Request(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_cache_header()
        self.send_header('Content-Type', 'text/html')
        self.send_cors_header()
        # with open('../html/forward.html') as f:
        #     forwarder_html = f.read()
        html = forwarder_html.encode('utf-8')
        self.send_header('Content-Length', len(html))
        self.end_headers()
        self.wfile.write(html)
        return


    def send_cache_header(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT')

    def send_cors_header(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Access-Control-Allow-Origin', '*')

    def log_message(self, *args) -> None:
        pass

server = ThreadingHTTPServer(('0.0.0.0', 9011), Request)
start_new_thread(server.serve_forever, ())
while True:
    sleep(10)