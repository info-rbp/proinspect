"""Memory-streaming ClamAV adapter. Never writes uploaded files or request logs."""
import datetime
import hashlib
import json
import os
import pwd
import re
import socket
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 8 * 1024 * 1024
LOCK = threading.BoundedSemaphore(1)

def reply(connection):
    value = b''
    while len(value) < 4096:
        part = connection.recv(4096-len(value))
        if not part:
            break
        value += part
        if value.endswith(b'\0'):
            return value[:-1].decode('ascii','strict')
    raise ValueError('Incomplete engine response')

def command(name):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(35)
        connection.connect('/run/clamav/clamd.sock')
        connection.sendall(b'z' + name.encode('ascii') + b'\0')
        return reply(connection)

def health():
    value = command('VERSION').split('/')
    if len(value) != 3 or not re.fullmatch(r'ClamAV 1\.[5-9]\.\d+', value[0]):
        raise ValueError('Unsupported engine')
    version = tuple(map(int,value[0].replace('ClamAV ','').split('.')))
    if version < (1,5,4):
        raise ValueError('Outdated engine')
    built = datetime.datetime.strptime(value[2], '%a %b %d %H:%M:%S %Y').replace(tzinfo=datetime.timezone.utc)
    age = (datetime.datetime.now(datetime.timezone.utc) - built).total_seconds()
    if age < -300 or age > 72 * 3600:
        raise ValueError('Stale definitions')
    return {'engineVersion':value[0], 'databaseVersion':int(value[1]), 'definitionsUpdatedAt':built.isoformat().replace('+00:00','Z')}

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def setup(self):
        super().setup()
        self.connection.settimeout(35)
    def log_message(self, *_args):
        pass
    def result(self, status, value):
        raw = json.dumps(value, separators=(',',':')).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Connection','close')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True
    def do_GET(self):
        if self.path != '/health':
            return self.result(404, {'error':'NOT_FOUND'})
        try:
            return self.result(200, health())
        except Exception:
            return self.result(503, {'error':'ENGINE_NOT_READY'})
    def do_POST(self):
        if self.path != '/scan':
            return self.result(404, {'error':'NOT_FOUND'})
        if not LOCK.acquire(blocking=False):
            return self.result(429, {'error':'SCANNER_BUSY'})
        try:
            if self.headers.get('Transfer-Encoding'):
                raise ValueError('Unbounded transfer')
            length = int(self.headers.get('Content-Length','0'))
            if length < 1 or length > MAX_BYTES:
                return self.result(413, {'error':'DOCUMENT_SIZE'})
            expected = self.headers.get('X-Expected-SHA256','')
            if not re.fullmatch(r'[a-f0-9]{64}', expected):
                raise ValueError('Missing digest')
            before = health()
            digest = hashlib.sha256()
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(35)
                connection.connect('/run/clamav/clamd.sock')
                connection.sendall(b'zINSTREAM\0')
                left = length
                while left:
                    part = self.rfile.read(min(65536,left))
                    if not part:
                        raise ValueError('Truncated document')
                    digest.update(part)
                    connection.sendall(struct.pack('!I',len(part)) + part)
                    left -= len(part)
                connection.sendall(struct.pack('!I',0))
                response = reply(connection)
            actual = digest.hexdigest()
            after = health()
            if actual != expected or before != after:
                raise ValueError('Changed digest or definitions')
            clean = response == 'stream: OK'
            unsafe = response.startswith('stream: ') and response.endswith(' FOUND')
            verdict = 'clean' if clean else 'unsafe' if unsafe else 'error'
            return self.result(200, {'engine':after,'verdict':verdict,'complete':clean or unsafe,'sha256':actual})
        except Exception:
            return self.result(503, {'error':'SCAN_FAILED'})
        finally:
            LOCK.release()

if __name__ == '__main__':
    if os.getuid() == 0:
        account = pwd.getpwnam('clamav')
        os.setgroups([])
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)
    ThreadingHTTPServer(('0.0.0.0',8080), Handler).serve_forever()
