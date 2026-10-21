from cse.llm import image_type


def test_image_type_reads_the_real_format():
    assert image_type(b"\x89PNG\r\n\x1a\n...") == "image/png"
    assert image_type(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert image_type(b"GIF89a") == "image/gif"
    assert image_type(b"\xff\xd8\xff\xe0") == "image/jpeg"
