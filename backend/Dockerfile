FROM python:3.11-slim

# Hugging Face Spaces non-root user (uid 1000) par chalta hai
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    HF_HOME=/home/user/.cache/huggingface

WORKDIR /app

# CPU-only torch (chhota image)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Embedding model build ke waqt hi download kar lo (start tez hoga)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

COPY --chown=user . .

# Hugging Face Spaces port 7860 use karta hai
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
