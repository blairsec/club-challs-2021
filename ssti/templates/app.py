from flask import Flask, request
import string
import os
import secrets

app = Flask(__name__)
alphabet = set(string.ascii_letters + string.digits + "_")
template_dir = os.environ.get("TEMPLATE_DIR", "./templates/")


@app.route("/add")
def add_template():
    name = secrets.token_hex(32)
    content = request.args.get("content")
    if not content or not (0 < len(content) <= 2048):
        return ("Invalid content", 400)
    with open(template_dir + name + ".j2", "w") as f:
        f.write(content)
    return name

@app.route("/")
def index():
    return "you have reached the local template site"
