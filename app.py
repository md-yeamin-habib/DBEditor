import os
import sys
import time
import socket
import threading
import webview
from flask_api import app

def find_free_port():
    """Finds an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def run_flask(port):
    """Runs the Flask backend server in a background thread."""
    # Turn off debug and reloader to prevent duplicate process spawning in packaged builds
    app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)

def get_icon_path():
    """Resolves the absolute path to static/icon.ico for local and PyInstaller builds."""
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    
    icon_path = os.path.join(base_dir, 'static', 'icon.ico')
    return icon_path if os.path.exists(icon_path) else None

def main():
    port = find_free_port()
    
    # Start Flask backend in a daemon thread
    server_thread = threading.Thread(target=run_flask, args=(port,), daemon=True)
    server_thread.start()
    
    # Allow local server a moment to start up
    time.sleep(0.5)

    icon_path = get_icon_path()

    # Create PyWebView desktop window
    webview.create_window(
        title="Database Studio",
        url=f"http://127.0.0.1:{port}",
        width=1280,
        height=800,
        min_size=(900, 600),
        resizable=True
    )

    # Launch PyWebView GUI
    webview.start(icon=icon_path if icon_path else None)

if __name__ == "__main__":
    main()