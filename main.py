import time
import requests


if __name__ == "__main__":

    BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

    params = {
        "query": "OpenAI",
        "mode": "ArtList",
        "format": "json",
        "maxrecords": 10,
    }

    for attempt in range(5):
        response = requests.get(BASE_URL, params=params)

        if response.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"Rate limited. Waiting {wait}s...")
            time.sleep(wait)
            continue

        response.raise_for_status()
        break
    else:
        raise RuntimeError("Still rate limited after several retries.")