import boto3
import pytest
from moto import mock_aws

from cse import brand as brandlib
from cse.cli import cmd_init
from cse.storage import LocalStorage, S3Storage, StorageError, from_env


@pytest.fixture
def local(tmp_path):
    return LocalStorage(tmp_path)


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket="test-bucket")
        yield S3Storage("test-bucket", client=client)


@pytest.mark.parametrize("store", ["local", "s3"])
def test_init_creates_parseable_template(store, request):
    storage = request.getfixturevalue(store)
    assert cmd_init(storage, "solis") == 0
    assert storage.list("brands/") == ["brands/solis/brand.md"]

    fields, body = brandlib.parse(storage.read_text("brands/solis/brand.md"))
    assert fields["name"] == "solis"
    assert set(brandlib.PROMPT_FIELDS) <= set(fields)
    assert brandlib.missing_fields(fields) == [
        f for f in brandlib.PROMPT_FIELDS if f != "country"
    ]
    assert "## Notes" in body


@pytest.mark.parametrize("store", ["local", "s3"])
def test_init_does_not_overwrite_without_force(store, request):
    storage = request.getfixturevalue(store)
    storage.write_text("brands/solis/brand.md", "my filled-in notes")
    cmd_init(storage, "solis")
    assert storage.read_text("brands/solis/brand.md") == "my filled-in notes"
    cmd_init(storage, "solis", force=True)
    assert storage.read_text("brands/solis/brand.md").startswith("---")


@pytest.mark.parametrize("slug", ["Solis", "../etc", "has space", ""])
def test_bad_slugs_rejected(slug, local):
    with pytest.raises(brandlib.BrandError):
        cmd_init(local, slug)


def test_parse_requires_front_matter():
    with pytest.raises(brandlib.BrandError):
        brandlib.parse("# no yaml here")


def test_from_env():
    assert isinstance(from_env({"STORAGE_BACKEND": "local"}), LocalStorage)
    with pytest.raises(StorageError):
        from_env({})
    with pytest.raises(StorageError):
        from_env({"STORAGE_BACKEND": "s3"})
