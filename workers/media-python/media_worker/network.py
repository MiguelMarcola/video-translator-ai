import os
import socket
from typing import Any


def prefer_ipv4_when_requested() -> None:
    if os.environ.get("MEDIA_WORKER_FORCE_IPV4") != "1":
        return
    original_getaddrinfo = socket.getaddrinfo

    def ipv4_getaddrinfo(host: Any, port: Any, family: int = 0, socket_type: int = 0, protocol: int = 0, flags: int = 0):
        selected_family = socket.AF_INET if family == socket.AF_UNSPEC else family
        return original_getaddrinfo(host, port, selected_family, socket_type, protocol, flags)

    socket.getaddrinfo = ipv4_getaddrinfo
