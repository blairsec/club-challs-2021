FROM python:3.8

WORKDIR /app
COPY ./requirements.txt /app/
RUN pip install -r requirements.txt

COPY . /app/

ARG PORT=8080
ENV PORT=${PORT}
ARG TEMPLATE_SITE=http://localhost:8081/
ENV TEMPLATE_SITE=${TEMPLATE_SITE}
ARG FLAG=flag{placeholder_flag}
ENV FLAG=${FLAG}

EXPOSE ${PORT}
CMD ["gunicorn", "-c", "./gunicorn.conf.py"]
