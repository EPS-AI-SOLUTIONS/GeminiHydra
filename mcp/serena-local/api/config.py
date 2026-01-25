"""Configuration settings for the API."""

# Quality presets mapping
CRF_MAP = {
    "draft": 28,
    "standard": 23,
    "high": 18,
    "lossless": 0
}

PRESET_MAP = {
    "draft": "ultrafast",
    "standard": "medium",
    "high": "medium",
    "lossless": "veryslow"
}
