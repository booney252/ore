"""Brand data storage.

All brand data lives under a `brands/` prefix in one bucket so every machine
sees the same files. The backend is chosen by STORAGE_BACKEND in `.env`:

- "s3":    any S3-compatible bucket (Cloudflare R2, Backblaze B2, Supabase
           Storage, AWS S3). Swapping providers is a `.env` change only.
- "local": a folder on disk. Only for tests and offline experiments; it does
           NOT sync between machines.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path


class StorageError(Exception):
    pass


class Storage(ABC):
    """Key/value file store. Keys are '/'-separated paths like 'brands/solis/brand.md'."""

    @abstractmethod
    def read_bytes(self, key: str) -> bytes: ...

    @abstractmethod
    def write_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def list(self, prefix: str) -> list[str]:
        """All keys under `prefix`, sorted."""

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def describe(self) -> str:
        """Human-readable location, for log lines."""

    def read_text(self, key: str) -> str:
        return self.read_bytes(key).decode("utf-8")

    def write_text(self, key: str, text: str) -> None:
        self.write_bytes(key, text.encode("utf-8"), content_type=_content_type(key))


def _content_type(key: str) -> str:
    if key.endswith(".json"):
        return "application/json"
    if key.endswith(".md"):
        return "text/markdown; charset=utf-8"
    return "text/plain; charset=utf-8"


class LocalStorage(Storage):
    def __init__(self, root: str | Path):
        self.root = Path(root).expanduser().resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents and path != self.root:
            raise StorageError(f"key escapes storage root: {key}")
        return path

    def read_bytes(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:
            raise StorageError(f"not found: {key}") from None

    def write_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def list(self, prefix: str) -> list[str]:
        base = self.root
        if not base.exists():
            return []
        keys = (p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file())
        return sorted(k for k in keys if k.startswith(prefix))

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def describe(self) -> str:
        return f"local folder {self.root}"


class S3Storage(Storage):
    def __init__(self, bucket: str, endpoint_url: str | None = None, region: str | None = None,
                 access_key_id: str | None = None, secret_access_key: str | None = None,
                 client=None):
        self.bucket = bucket
        self.endpoint_url = endpoint_url
        if client is None:
            import boto3

            client = boto3.client(
                "s3",
                endpoint_url=endpoint_url or None,
                region_name=region or None,
                aws_access_key_id=access_key_id or None,
                aws_secret_access_key=secret_access_key or None,
            )
        self.client = client

    def read_bytes(self, key: str) -> bytes:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            raise StorageError(f"not found: {key}") from None

    def write_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        extra = {"ContentType": content_type} if content_type else {}
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def list(self, prefix: str) -> list[str]:
        keys = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return sorted(keys)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def describe(self) -> str:
        where = self.endpoint_url or "AWS"
        return f"bucket '{self.bucket}' at {where}"


def from_env(env: dict | None = None) -> Storage:
    env = os.environ if env is None else env
    backend = (env.get("STORAGE_BACKEND") or "").strip().lower()
    if backend == "s3":
        bucket = env.get("S3_BUCKET")
        if not bucket:
            raise StorageError("STORAGE_BACKEND=s3 but S3_BUCKET is not set in .env")
        return S3Storage(
            bucket=bucket,
            endpoint_url=env.get("S3_ENDPOINT_URL"),
            region=env.get("S3_REGION"),
            access_key_id=env.get("S3_ACCESS_KEY_ID"),
            secret_access_key=env.get("S3_SECRET_ACCESS_KEY"),
        )
    if backend == "local":
        return LocalStorage(env.get("LOCAL_STORAGE_DIR") or "./data")
    raise StorageError(
        "STORAGE_BACKEND must be 's3' or 'local'. Copy .env.example to .env and fill it in."
    )
