from flask import Flask, render_template, render_template_string, request

app = Flask(__name__, static_url_path="/static", static_folder="./static")
flag = "flag{placeholder_flag}"

@app.route("/render", methods = ["GET"])
def render_route():
    return render_template_string(request.args.get("t", ""))

@app.route("/")
def index():
    return render_template("index.j2")

