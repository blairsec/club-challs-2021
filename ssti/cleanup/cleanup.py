import time
import os

cleanup_dir = os.environ.get("CLEANUP_DIR", "/cleanup")
expiration = int(os.environ.get("EXPIRATION", "3600"))

while True:
    to_remove = []
    for f in os.scandir(cleanup_dir):
        duration = time.time() - os.path.getctime(f.path)
        if duration > expiration:
            to_remove.append(f.path)
    for f in to_remove:
        os.remove(f)
    time.sleep(60)