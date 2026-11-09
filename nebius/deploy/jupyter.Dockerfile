# Per-project notebook kernel image used by NEBIUS (NEBIUS_JUPYTER_MODE=docker).
# Runs as an unprivileged user; NEBIUS starts it with --cap-drop ALL, no-new-privileges, memory/CPU/PID limits
# and on an internal Docker network (no Internet egress).
FROM python:3.12-slim
ARG PIP_INDEX_URL
RUN pip install --no-cache-dir jupyter_server==2.14.2 ipykernel==6.29.5 numpy==2.1.3 \
 && useradd -m -u 1000 nb && mkdir -p /home/nb/work && chown -R nb /home/nb
USER nb
WORKDIR /home/nb/work
EXPOSE 8888
CMD ["jupyter", "server", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--ServerApp.root_dir=/home/nb/work"]
