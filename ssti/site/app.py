from flask import Flask, render_template, request
from flask.templating import TemplateNotFound
import string
import requests
import os

from requests.exceptions import RequestException

app = Flask(__name__, static_url_path="/static", static_folder="./static")
alphabet = set(string.ascii_letters + string.digits + "_")
site_alphabet = set(string.printable) - set("{}")
flag = os.environ.get("FLAG", "flag{placeholder_flag}")

template_site = os.environ.get("TEMPLATE_SITE", "http://localhost:8081/")
if not template_site.endswith("/"):
    template_site += "/"

@app.route("/t/<template>")
def show_template(template):
    if len(template) > 64 or any(x not in alphabet for x in template):
        return ("Invalid template", 400)
    try:
        return render_template(f"uploaded/{template}.j2")
    except TemplateNotFound:
        return ("Unknown template", 404)

@app.route("/ping", methods = ["POST"])
def ping():
    site = request.form.get("site", "https://example.com/")
    # no query strings allowed
    if "?" in site:
        return ("No query strings allowed in site", 400)
    try:
        return requests.get(site).text[:128]
    except requests.RequestException:
        return ("Error while making request", 400)

@app.route("/add_site", methods = ["POST"])
def add_site():
    site = request.form.get("site")
    if not site or not (0 < len(site) <= 2048):
        return ("Site must be 1-2048 chars long", 400)
    if any(x not in site_alphabet for x in site):
        return ("Site content contains invalid characters", 400)
    r = requests.get(template_site + "add", params={"content": site})
    if r.status_code == 200:
        return r.text
    else:
        return ("Got error while adding site: " + r.text, 500)

@app.route("/")
def index():
    return render_template("index.j2", template_site=template_site)

