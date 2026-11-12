# The stand-in PHP host for scripts/deploy-site.test.mjs: explicit FTPS over a folder, nothing else.
import sys

from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import TLS_FTPHandler
from pyftpdlib.servers import FTPServer

root, port, cert, key = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
authorizer = DummyAuthorizer()
authorizer.add_user("deploy", "s3cret", root, perm="elradfmwMT")
handler = TLS_FTPHandler
handler.certfile, handler.keyfile = cert, key
handler.authorizer = authorizer
handler.tls_control_required = True
handler.tls_data_required = True
handler.passive_ports = range(port + 1, port + 20)
server = FTPServer(("127.0.0.1", port), handler)
print("ready", flush=True)
server.serve_forever()
