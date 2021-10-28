from flask import Flask, render_template, render_template_string, request
from jinja2 import TemplateError

app = Flask(__name__, static_url_path="/static", static_folder="./static")
flag = "flag{placeholder_flag}"

@app.route("/render", methods = ["GET"])
def render_route():
    try:
        return render_template_string(request.args.get("t", ""))
    except TemplateError as e:
        return ("got error: " + str(e), 500)

@app.route("/")
def index():
    return render_template("index.j2")

