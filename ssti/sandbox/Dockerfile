FROM python:3.8

WORKDIR /app
COPY ./requirements.txt /app/
RUN pip install -r requirements.txt

COPY . /app/

ARG PORT=8080
ENV PORT=${PORT}

EXPOSE ${PORT}
CMD ["gunicorn", "-c", "./gunicorn.conf.py"]
