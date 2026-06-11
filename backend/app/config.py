import os

OCEANCARE_STORIES_URL_EN: str = os.getenv(
    "OCEANCARE_STORIES_URL_EN",
    "https://www.oceancare.org/en/stories-and-news/",
)
OCEANCARE_STORIES_URL_DE: str = os.getenv(
    "OCEANCARE_STORIES_URL_DE",
    "https://www.oceancare.org/de/storys-and-news/",
)

def stories_base_url(lang: str) -> str:
    return OCEANCARE_STORIES_URL_DE if lang == "de" else OCEANCARE_STORIES_URL_EN
