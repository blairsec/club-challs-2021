import os

port = os.environ.get("PORT", "8080")

wsgi_app = "app:app"
bind = f"0.0.0.0:{port}"
workers = 4